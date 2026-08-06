import { execFile, spawn } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { promisify } from "util";
import { BuildAuthorityService } from "../autonomous-authority";
import { AuthenticatedOperator, GenesisStateRepository, OperatorIdentityService, PersistentAuthorityLedger,
    PersistentBuildGrantRegistry, VerifiableApproval } from "../genesis-state";
import { GitHubRepositoryGateway } from "../platform";
import { GenesisPbosBuildChannel } from "../platform";
import { REFERENCE_SYSTEMS } from "./system-definition";
import { GenesisBuildSession, GenesisControlPlane } from "./genesis-control-plane";
import { GenesisSystemCatalog } from "./system-catalog";
import { GenesisTerminal, SessionAuthorityProvider } from "./genesis-terminal";
import { GenesisWorkflowService } from "./genesis-workflow-service";
import { NodeTerminalIO, TerminalIO } from "./terminal-io";
import { SystemIntakeTerminal } from "./system-intake-terminal";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { createDefaultRemediationHandler, GitHubCheckCollector, RemediationRun, ResumableRemediationEngine } from "../validation-automation";
import { NodeCommandRunner } from "../platform";
import { AutonomousBatchService, BackgroundMonitor, BackgroundProcessLauncher, OperatorContinuityService, OperatorMemoService } from "../operator-continuity";
import { ProductionRecoveryAuthority, ProductionRuntimeService, ProtectedEnvironmentResolver } from "../production-runtime";
import { GovernedMissionQueue, ProductionMissionAdapterRegistry, ProductionMissionRunner } from "../production-runtime";
import { startMissionControl } from "../mission-control";
import { playbookAcademicJourneyExecutor, playbookApplicationJourneyExecutor, playbookFoundationExecutor,
    playbookMessagingJourneyExecutor, playbookNotificationJourneyExecutor, playbookOpportunityJourneyExecutor,
    playbookMobileCertificationExecutor, playbookMobileFoundationExecutor, playbookMobileJourneysExecutor,
    playbookMobileStoreReadinessExecutor,
    playbookProductJourneysExecutor, playbookScholarSliceExecutor, playbookSupportJourneyExecutor,
    inspectPlaybookWebStagingReadiness, playbookWebStagingExecutor, playbookWebStagingProtectedEnvironmentFiles,
    inspectPlaybookMobileReleaseReadiness, playbookMobileReleaseProtectedEnvironmentFiles,
    inspectPlaybookAcademicAcceptanceReadiness,
    inspectPlaybookScholarStagingReadiness, inspectPlaybookStagingMigrationReadiness, isAdditiveScholarMigrationEligible,
    playbookScholarProtectedEnvironmentFiles, playbookStagingMigrationDefinition,
    PlaybookStagingMigrationDefinition, PlaybookStagingMigrationService, repositoryGapAnalysisExecutor } from "../application-readiness";
import { BULLETPROOF_CONNECTOR_MANIFEST, BULLETPROOF_DOMAIN_MANIFEST, createPlaybookBlueprint,
    PLAYBOOK_CONNECTOR_MANIFEST, PLAYBOOK_DOMAIN_MANIFEST } from "../reference-systems";
import { RepositoryInspection } from "../platform";
import { MissionQueueItem, ProductionRun } from "../production-runtime";
import { ConstitutionalAuthorityLoader } from "../boot";
import { ecosystemPlatformEvidenceExecutor, inspectEcosystemEvidenceReadiness } from "../ecosystem-certification";

interface LocalProfile { readonly operatorId: string; readonly credential: string; readonly organizationId: string; readonly githubLogin: string; }
const stateRoot = process.env.PBOS_STATE_HOME ?? join(homedir(), ".pbos");
const profilePath = join(stateRoot, "profile.json");
const operatorsPath = join(stateRoot, "operators.json");
const genesisPath = join(stateRoot, "genesis-state.json");

export function latestRunsBySystem(runs: readonly RemediationRun[]): readonly RemediationRun[] {
    const latestBySystem = new Map<string, RemediationRun>();
    runs.forEach(run => {
        const current = latestBySystem.get(run.systemId);
        if (!current || run.pullRequest.number > current.pullRequest.number ||
            (run.pullRequest.number === current.pullRequest.number && run.updatedAt > current.updatedAt)) {
            latestBySystem.set(run.systemId, run);
        }
    });
    return [...latestBySystem.values()];
}

export function latestUnfinishedRuns(runs: readonly RemediationRun[]): readonly RemediationRun[] {
    return latestRunsBySystem(runs).filter(run => run.state !== "BLOCKED" &&
        (run.state !== "READY_FOR_CERTIFICATION" || !run.evidence.some(item => item.state === "PASSED")));
}

export function effectiveRemediationState(run: RemediationRun): RemediationRun["state"] {
    return run.state === "READY_FOR_CERTIFICATION" && !run.evidence.some(item => item.state === "PASSED")
        ? "WAITING_FOR_CHECKS" : run.state;
}

async function login(): Promise<number> {
    const run = promisify(execFile);
    await run("gh", ["auth", "status"]);
    const githubLogin = (await run("gh", ["api", "user", "--jq", ".login"])).stdout.trim();
    const terminal = createInterface({ input: stdin, output: stdout });
    const organizationId = (await terminal.question("PBOS organization ID: ")).trim();
    const displayName = (await terminal.question("Operator display name: ")).trim();
    terminal.close();
    const enrolled = new OperatorIdentityService(operatorsPath).enroll(organizationId, displayName);
    mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
    const profile: LocalProfile = { operatorId: enrolled.operator.operatorId, credential: enrolled.credential, organizationId, githubLogin };
    writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    stdout.write(`PBOS login complete for ${displayName} (${githubLogin}) in ${organizationId}.\n`);
    return 0;
}

function profile(): LocalProfile {
    try { return JSON.parse(readFileSync(profilePath, "utf8")) as LocalProfile; }
    catch { throw new Error("PBOS login required. Run: pbos login"); }
}

async function ensureGitHubAuthentication(local: LocalProfile): Promise<void> {
    const run = promisify(execFile);
    try {
        await run("gh", ["auth", "status", "-h", "github.com"]);
    } catch {
        const io = new NodeTerminalIO();
        let approved = false;
        try {
            io.write("PBOS GitHub authentication has expired.");
            approved = ["y", "yes"].includes((await io.prompt("Reauthenticate GitHub now and continue this build? [y/N] ")).trim().toLowerCase());
        } finally { io.close(); }
        if (!approved) throw new Error("GitHub authentication is required before PBOS can continue.");
        const exitCode = await new Promise<number>((resolve, reject) => {
            const child = spawn("gh", ["auth", "login", "-h", "github.com", "--web"], { stdio: "inherit" });
            child.once("error", reject);
            child.once("exit", code => resolve(code ?? 1));
        });
        if (exitCode !== 0) throw new Error("GitHub authentication did not complete successfully.");
        await run("gh", ["auth", "status", "-h", "github.com"]);
    }
    const login = (await run("gh", ["api", "user", "--jq", ".login"])).stdout.trim();
    if (login.toLowerCase() !== local.githubLogin.toLowerCase()) {
        throw new Error(`GitHub account mismatch: PBOS is enrolled for ${local.githubLogin}, but gh is authenticated as ${login}.`);
    }
}

function runtime() {
    const local = profile();
    const identities = new OperatorIdentityService(operatorsPath);
    const operator = identities.authenticate(local.operatorId, local.credential);
    const state = new GenesisStateRepository(genesisPath);
    const production = new ProductionRuntimeService(state);
    production.recoverStaleRuns();
    REFERENCE_SYSTEMS.forEach(system => state.saveSystem(system));
    const grants = new PersistentBuildGrantRegistry(state);
    const authority = new BuildAuthorityService(grants, new PersistentAuthorityLedger(state));
    const control = new GenesisControlPlane(new GenesisSystemCatalog(state.systems()), authority, state);
    const sessionAuthority: SessionAuthorityProvider = { authorize: async systemId => {
        const approval = identities.approve(operator, "ISSUE_BUILD_GRANT", systemId, 15);
        if (!identities.verify(approval, "ISSUE_BUILD_GRANT", systemId)) throw new Error("Build grant approval verification failed.");
        state.appendAudit({ eventId: approval.approvalId, type: "VERIFIABLE_APPROVAL", actorId: operator.operatorId,
            resource: systemId, occurredAt: approval.issuedAt, evidence: { approval } });
        return { operatorId: operator.operatorId, approvalId: approval.approvalId };
    } };
    const commands = new NodeCommandRunner();
    const gateway = new GitHubRepositoryGateway(join(stateRoot, "repositories"), commands);
    const batches = new AutonomousBatchService(state, production);
    const workflows = new GenesisWorkflowService(
        gateway, undefined, undefined,
        (session, action, risk, branch) => control.authorizeAction(session.sessionId, action, risk, branch),
        (stage, message) => stdout.write(`[${stage}] ${message}\n`), batches
    );
    const remediation = new ResumableRemediationEngine(state, new GitHubCheckCollector(commands), createDefaultRemediationHandler(gateway));
    const memos = new OperatorMemoService(join(stateRoot, "memos"), state);
    return { state, control, sessionAuthority, workflows, remediation, memos, batches, production,
        gateway, identities, operator };
}

function systemIdFor(value?: string): string | undefined {
    const target = value?.toLowerCase();
    if (target === "playbook" || target === "the-playbook" || target === "playbook-system-001") return "PLAYBOOK-SYSTEM-001";
    if (target === "bulletproof" || target === "bulletproof-system-001") return "BULLETPROOF-SYSTEM-001";
    return value && REFERENCE_SYSTEMS.some(system => system.systemId === value) ? value : undefined;
}

export async function ensureReadinessQueue(services: Pick<ReturnType<typeof runtime>, "state" | "batches" | "gateway">,
    systemId = "PLAYBOOK-SYSTEM-001", report: (message: string) => void = () => undefined): Promise<RepositoryInspection | undefined> {
    if (systemId !== "PLAYBOOK-SYSTEM-001") throw new Error(`No certified readiness queue compiler is registered for ${systemId}.`);
    const system = services.state.systems().find(item => item.systemId === systemId);
    if (!system) throw new Error(`Registered system not found: ${systemId}`);
    const existing = services.state.missionQueue(systemId);
    if (existing.length) {
        const revision = existing.find(item => item.missionId === "playbook-capability-foundation")?.evidenceIds
            .find(item => item.startsWith("repository:"))?.slice("repository:".length) ?? "UNKNOWN";
        services.batches.prepareReadinessQueue(systemId, revision);
        new ProductionRuntimeService(services.state).reconcileMissionExecutionState(systemId);
        report("Readiness queue synchronized with the current evidence-gated mission architecture.");
        return undefined;
    }
    const [owner, name] = system.repository.split("/");
    if (!owner || !name) throw new Error(`Invalid repository identity: ${system.repository}`);
    report(`No durable readiness queue exists. Verifying ${system.repository} before initialization…`);
    const inspection = await services.gateway.inspectRepository({ owner, name, defaultBranch: system.defaultBranch });
    const required = createPlaybookBlueprint().capabilities;
    const missing = required.filter(capability => !inspection.findings.includes(`CAPABILITY:${capability}:PRESENT`));
    if (missing.length) {
        throw new Error(`Playbook readiness queue requires governed evidence for all capabilities. Missing: ${missing.join(", ")}.`);
    }
    services.batches.prepareReadinessQueue(systemId, inspection.revision);
    report(`Readiness queue initialized from governed revision ${inspection.revision}.`);
    return inspection;
}

export interface MissionApprovalServices {
    readonly state: GenesisStateRepository;
    readonly identities: OperatorIdentityService;
    readonly operator: AuthenticatedOperator;
}

function connectorContracts(systemId: string) {
    if (systemId === "PLAYBOOK-SYSTEM-001") return { connector: PLAYBOOK_CONNECTOR_MANIFEST, domains: [PLAYBOOK_DOMAIN_MANIFEST] };
    if (systemId === "BULLETPROOF-SYSTEM-001") return { connector: BULLETPROOF_CONNECTOR_MANIFEST, domains: [BULLETPROOF_DOMAIN_MANIFEST] };
    throw new Error(`No PBOS v1 connector contract is registered for ${systemId}.`);
}

export function durableMissionApproval(services: MissionApprovalServices,
    mission: MissionQueueItem): VerifiableApproval | undefined {
    for (const event of [...services.state.audit()].reverse()) {
        if (event.type !== "VERIFIABLE_APPROVAL" || event.resource !== mission.missionId ||
            event.evidence.purpose !== "START_PRODUCTION_MISSION") continue;
        const approval = event.evidence.approval as VerifiableApproval | undefined;
        if (approval && services.identities.verify(approval, "START_PRODUCTION_MISSION", mission.missionId)) return approval;
    }
    return undefined;
}

export async function promptForMissionApproval(io: TerminalIO, services: MissionApprovalServices,
    mission: MissionQueueItem): Promise<VerifiableApproval | undefined> {
    io.write("");
    io.write("PBOS APPROVAL CHECKPOINT");
    io.write(`Mission: ${mission.title}`);
    io.write(`Why now: ${mission.rationale}`);
    io.write("PBOS is requesting authority to prepare and execute only this governed mission.");
    if (mission.missionId === "048-web-staging") {
        io.write("This approval includes one exact-revision Vercel preview deployment after independent CI passes.");
        io.write("Production deployment, merge, secret mutation, destructive migration, certification, and cross-repository work remain excluded.");
    } else if (["049-store-readiness", "049-certification"].includes(mission.missionId)) {
        io.write("This approval includes exact-revision EAS internal builds and store-signed binaries after independent CI passes.");
        io.write("Store submission is restricted to TestFlight and Google Play internal testing. Public release, merge, secret mutation, destructive migration, and certification remain excluded.");
    } else {
        io.write("Protected actions remain excluded: merge, production deployment, secrets, destructive migration, certification, and cross-repository work.");
    }
    const response = (await io.prompt("Authorize this mission now? [y/N] ")).trim().toLowerCase();
    if (response !== "y" && response !== "yes") {
        io.write("MISSION NOT AUTHORIZED");
        io.write("No repository changes were started. The mission remains safely queued.");
        return undefined;
    }
    const approval = services.identities.approve(services.operator, "START_PRODUCTION_MISSION", mission.missionId, 30);
    if (!services.identities.verify(approval, "START_PRODUCTION_MISSION", mission.missionId)) {
        throw new Error("Production-mission approval verification failed.");
    }
    services.state.appendAudit({ eventId: approval.approvalId, type: "VERIFIABLE_APPROVAL",
        actorId: services.operator.operatorId, resource: mission.missionId, occurredAt: approval.issuedAt,
        evidence: { approval, purpose: "START_PRODUCTION_MISSION" } });
    new ProductionRuntimeService(services.state).updateMissionStatus(mission.systemId, mission.missionId,
        mission.status, [`approval:${approval.approvalId}`]);
    io.write("MISSION AUTHORIZED");
    io.write(`Approval: ${approval.approvalId}`);
    io.write("The signed decision is durable. Certification will still require a separate human decision after validation.");
    return approval;
}

export async function promptForRecoveryAuthority(io: TerminalIO, services: MissionApprovalServices,
    production: ProductionRuntimeService, run: ProductionRun): Promise<VerifiableApproval | undefined> {
    const budget = production.repairBudget(run.runId);
    if (run.status !== "BLOCKED" || budget.remaining > 0) return undefined;
    const recovery = new ProductionRecoveryAuthority(services.state, production);
    const epoch = recovery.request(run.runId);
    io.write("");
    io.write("PBOS CONSTITUTIONAL RECOVERY AUTHORITY");
    io.write(`Recovery epoch: ${epoch.epochNumber} (${epoch.recoveryEpochId})`);
    io.write(`Existing mission: ${epoch.missionTitle}`);
    io.write(`Budget exhaustion: ${epoch.reasonBudgetExhausted.replace(/\s+/g, " ").slice(0, 1_000)}`);
    io.write(`Attempted repairs preserved: ${epoch.attemptedRepairs.length}`);
    io.write(`Repository state: ${epoch.repositoryState.branch}@${epoch.repositoryState.commit}`);
    io.write(`Runtime state: ${epoch.runtimeState.status}; ${epoch.runtimeState.repairAttempts}/${epoch.runtimeState.repairAttemptLimit} attempts consumed`);
    io.write("Remaining defects:");
    epoch.remainingDefects.forEach(defect => io.write(`- ${defect.replace(/\s+/g, " ").slice(0, 1_000)}`));
    io.write("PBOS will preserve the existing run, mission, evidence, repository lineage, and every prior repair attempt.");
    io.write("This recovery epoch authorizes exactly one additional bounded repair attempt; repairAttempts will not be reset.");
    io.write("Certification, merge, production deployment, secrets, and destructive migration remain excluded.");
    const response = (await io.prompt(`Authorize recovery epoch ${epoch.epochNumber} for one bounded repair attempt? [y/N] `)).trim().toLowerCase();
    if (response !== "y" && response !== "yes") {
        io.write("RECOVERY EPOCH NOT AUTHORIZED");
        io.write("The run remains blocked with its complete history intact.");
        return undefined;
    }
    const action = "AUTHORIZE_PRODUCTION_RECOVERY_EPOCH";
    const approval = services.identities.approve(services.operator, action, epoch.recoveryEpochId, 15);
    if (!services.identities.verify(approval, action, epoch.recoveryEpochId)) {
        throw new Error("Recovery Authority approval verification failed.");
    }
    services.state.appendAudit({ eventId: approval.approvalId, type: "VERIFIABLE_APPROVAL",
        actorId: services.operator.operatorId, resource: epoch.recoveryEpochId, occurredAt: approval.issuedAt,
        evidence: { approval, purpose: action, runId: run.runId, missionId: epoch.missionId, additionalAttempts: 1 } });
    recovery.authorize(epoch.recoveryEpochId, approval.approvalId, services.operator.operatorId,
        (approvalId, actorId) => approvalId === approval.approvalId && actorId === services.operator.operatorId &&
            services.identities.verify(approval, action, epoch.recoveryEpochId));
    io.write("CONSTITUTIONAL RECOVERY EPOCH AUTHORIZED");
    io.write(`Approval: ${approval.approvalId}`);
    io.write(`Recovery epoch: ${epoch.recoveryEpochId}`);
    io.write(`New repair budget: ${budget.attempts}/${budget.limit + 1}`);
    return approval;
}

export async function streamProductionTelemetry(state: GenesisStateRepository, runId: string,
    write: (message: string) => void = message => stdout.write(`${message}\n`),
    wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    intervalMs = 5_000, maximumPolls = 720): Promise<"AWAITING_APPROVAL" | "BLOCKED" | "DETACHED"> {
    const seen = new Set<string>();
    for (let poll = 0; poll < maximumPolls; poll += 1) {
        const production = new ProductionRuntimeService(state);
        production.events(runId).filter(event => !seen.has(event.eventId)).forEach(event => {
            seen.add(event.eventId);
            write(`${event.timestamp} ${event.type}: ${event.summary}`);
            if (["STAGE_FAILED", "RUN_BLOCKED", "REPAIR_FAILED"].includes(event.type)) {
                const detail = [event.payload.error, event.payload.reason, event.payload.classification]
                    .find(value => typeof value === "string" && value.trim());
                if (typeof detail === "string") write(`  ↳ ${detail.replace(/\s+/g, " ").slice(0, 2_000)}`);
            }
        });
        const run = production.run(runId);
        if (!run) throw new Error(`Production telemetry run not found: ${runId}`);
        const stage = run.activeStageId ? state.productionStages(runId).find(item => item.stageId === run.activeStageId) : undefined;
        write(`ACTIVE: ${run.status} — ${stage?.title ?? "transitioning"} — elapsed ${Math.max(0, Date.now() - Date.parse(run.startedAt))}ms — heartbeat ${run.lastHeartbeatAt}`);
        if (run.status === "AWAITING_APPROVAL") {
            write("HUMAN APPROVAL REQUIRED: validation passed; review the certification memo and draft pull request.");
            return "AWAITING_APPROVAL";
        }
        if (["BLOCKED", "FAILED", "CANCELLED"].includes(run.status)) {
            write(`PBOS STOPPED: ${run.status} — ${run.terminalSummary ?? "operator review required"}`);
            return "BLOCKED";
        }
        await wait(intervalMs);
    }
    write("PBOS monitoring remains active in the background; this terminal detached after the foreground polling limit.");
    return "DETACHED";
}

async function promptForValidatedMissionPromotion(services: ReturnType<typeof runtime>, session: GenesisBuildSession,
    mission: MissionQueueItem, productionRunId: string, remediationRun: RemediationRun): Promise<boolean> {
    const io = new NodeTerminalIO();
    let promote = false;
    try {
        io.write("");
        io.write("PBOS PROTECTED RELEASE CHECKPOINT");
        io.write(`Mission: ${mission.title}`);
        io.write(`Validated pull request: ${remediationRun.pullRequest.url}`);
        io.write("This decision certifies the mission and merges its validated application change. Production deployment remains separate.");
        if (["049-store-readiness", "049-certification"].includes(mission.missionId)) {
            io.write("Before approving, open the commit-bound iOS and Android install links in the PBOS memo and confirm both internal builds were exercised.");
            io.write("Approval attests that signing identities and store listings are correctly bound, privacy disclosures and screenshots were reviewed, and TestFlight plus Google Play internal testing passed.");
            io.write("Public App Store and Google Play production release remain excluded.");
        }
        const answer = (await io.prompt("Certify and merge this validated mission now? [y/N] ")).trim().toLowerCase();
        promote = answer === "y" || answer === "yes";
        if (!promote) io.write("Validated work remains unmerged and ready for later certification.");
    } finally {
        io.close();
    }
    if (!promote) return false;
    const certificationApproval = services.identities.approve(services.operator, "CERTIFY_PRODUCTION_MISSION", productionRunId, 15);
    const mergeApproval = services.identities.approve(services.operator, "MERGE_VALIDATED_PULL_REQUEST", remediationRun.pullRequest.url, 15);
    if (!services.identities.verify(certificationApproval, "CERTIFY_PRODUCTION_MISSION", productionRunId) ||
        !services.identities.verify(mergeApproval, "MERGE_VALIDATED_PULL_REQUEST", remediationRun.pullRequest.url)) {
        throw new Error("Protected promotion approval signature verification failed.");
    }
    const certificationDecision = services.control.authorizeAction(session.sessionId, "CERTIFY_SYSTEM", "HIGH",
        remediationRun.pullRequest.branch, certificationApproval.approvalId);
    const mergeDecision = services.control.authorizeAction(session.sessionId, "MERGE_MAIN", "HIGH",
        remediationRun.pullRequest.branch, mergeApproval.approvalId);
    if (!certificationDecision.allowed || !mergeDecision.allowed) {
        throw new Error(`Protected promotion denied: ${!certificationDecision.allowed ? certificationDecision.reason : mergeDecision.reason}`);
    }
    services.state.appendAudit({ eventId: certificationApproval.approvalId, type: "VERIFIABLE_APPROVAL",
        actorId: services.operator.operatorId, resource: productionRunId, occurredAt: certificationApproval.issuedAt,
        evidence: { approval: certificationApproval, purpose: "CERTIFY_PRODUCTION_MISSION" } });
    services.state.appendAudit({ eventId: mergeApproval.approvalId, type: "VERIFIABLE_APPROVAL",
        actorId: services.operator.operatorId, resource: remediationRun.pullRequest.url, occurredAt: mergeApproval.issuedAt,
        evidence: { approval: mergeApproval, purpose: "MERGE_VALIDATED_PULL_REQUEST" } });
    const missionRunner = new ProductionMissionRunner(services.state, services.production);
    missionRunner.assertCertifiable(productionRunId);
    await services.gateway.mergePullRequest(remediationRun.pullRequest);
    missionRunner.certify(productionRunId, certificationApproval.approvalId);
    stdout.write(`[CERTIFIED] ${mission.title}\n[MERGED] ${remediationRun.pullRequest.url}\n`);
    return true;
}

async function resumeExistingProductionValidation(services: ReturnType<typeof runtime>, systemId: string,
    target?: string): Promise<number | undefined> {
    const productionRun = [...services.state.productionRuns()].reverse().find(item => item.systemId === systemId &&
        ["VALIDATING", "BLOCKED", "PAUSED", "RECOVERING"].includes(item.status) &&
        item.evidenceIds.some(evidenceId => evidenceId.startsWith("remediation-run:")));
    if (!productionRun) return undefined;
    const remediationId = productionRun.evidenceIds.find(item => item.startsWith("remediation-run:"))!
        .slice("remediation-run:".length);
    let remediationRun = services.state.remediationRun(remediationId);
    if (!remediationRun) throw new Error(`Production run ${productionRun.runId} references missing remediation state ${remediationId}.`);
    if (remediationRun.state === "BLOCKED") {
        stdout.write(`PBOS validation is blocked: ${remediationRun.blockers.join("; ") || "operator review required"}\n`);
        return 1;
    }
    const currentBudget = services.production.repairBudget(productionRun.runId);
    if (productionRun.status === "BLOCKED" && currentBudget.remaining === 0) {
        const io = new NodeTerminalIO();
        let recoveryApproval: VerifiableApproval | undefined;
        try {
            recoveryApproval = await promptForRecoveryAuthority(io, services, services.production, productionRun);
        } finally {
            io.close();
        }
        if (!recoveryApproval) return 1;
    }
    const session = [...services.state.sessions()].reverse().find(item => item.system.systemId === systemId &&
        item.grant.mode !== "READ_ONLY" && !item.grant.revokedAt && item.grant.expiresAt.getTime() > Date.now());
    if (!session) throw new Error(`No active governed build session can resume production run ${productionRun.runId}. Run: pbos build ${target ?? "playbook"}`);
    remediationRun = await services.remediation.resume(remediationRun.runId,
        run => services.workflows.authorizeRemediation(session, run.pullRequest.branch));
    if (remediationRun.state === "BLOCKED") {
        stdout.write(`PBOS validation is blocked: ${remediationRun.blockers.join("; ") || "operator review required"}\n`);
        return 1;
    }
    if (remediationRun.state !== "READY_FOR_CERTIFICATION") {
        const launcher = new BackgroundProcessLauncher(join(__dirname, "..", "..", "bin", "pbos.js"), services.state,
            join(stateRoot, "logs"));
        const job = launcher.launch(systemId, session.sessionId, remediationRun.runId);
        stdout.write(`PBOS validation is ${remediationRun.state}; exact-head checks are still running.\n`);
        stdout.write(`Validation monitor: PID ${job.pid}\nMonitor log: ${job.logPath}\n`);
        stdout.write("PBOS will resume the blocked functional run only after the replacement revision passes independent checks.\n");
        return 0;
    }
    const productionMission = services.state.missionQueue(systemId).find(item => item.title === productionRun.selectedMission);
    let governedRun = services.production.run(productionRun.runId)!;
    const validatedRevision = remediationRun.headSha;
    if (governedRun.currentCommit !== validatedRevision) {
        governedRun = productionMission?.completionPolicy?.kind === "FUNCTIONAL_APPLICATION"
            ? services.production.rebindRepositoryAfterRemediation(productionRun.runId, remediationRun.runId,
                remediationRun.pullRequest.branch, validatedRevision)
            : services.production.updateRepositoryPosition(productionRun.runId, remediationRun.pullRequest.branch,
                validatedRevision);
    }
    if (productionRun.selectedMission === "Complete Scholar onboarding-to-dashboard slice") {
        const [owner, name] = productionRun.repository.split("/");
        if (!owner || !name) throw new Error(`Invalid repository identity: ${productionRun.repository}`);
        const workingDirectory = await services.gateway.workingDirectory({ owner, name, defaultBranch: "main" });
        const staging = await inspectPlaybookScholarStagingReadiness(workingDirectory);
        stdout.write(`Protected Scholar staging resources: ${staging.resources.filter(item => item.ready).length}/${staging.resources.length}\n`);
        if (!staging.ready) {
            stdout.write(`PBOS STAGING MIGRATION REQUIRED: ${staging.blockers.join(", ")}\n`);
            try {
                const migration = await migratePlaybookStaging(remediationRun.runId);
                if (migration !== 0) {
                    const current = services.production.run(productionRun.runId);
                    if (current?.status === "VALIDATING") services.production.pause(current.runId, current.actorId);
                    return migration;
                }
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                const current = services.production.run(productionRun.runId);
                if (current && current.status !== "BLOCKED") {
                    services.production.blockMissionForRun(productionRun.runId, reason);
                    services.production.transition(productionRun.runId, "BLOCKED",
                        "Protected Scholar staging preparation failed.", { reason });
                }
                throw error;
            }
        }
    }
    const resumableRun = services.production.run(productionRun.runId)!;
    if (["PAUSED", "RECOVERING"].includes(resumableRun.status)) {
        services.production.resume(productionRun.runId, resumableRun.actorId);
    } else if (productionMission?.completionPolicy?.kind === "FUNCTIONAL_APPLICATION") {
        services.production.recoverBlockedFunctionalValidation(productionRun.runId, remediationRun.runId, governedRun.currentCommit);
    } else {
        services.production.recoverBlockedValidation(productionRun.runId, remediationRun.runId, governedRun.currentCommit);
    }
    const launcher = new BackgroundProcessLauncher(join(__dirname, "..", "..", "bin", "pbos.js"), services.state, join(stateRoot, "logs"));
    const job = launcher.launch(systemId, session.sessionId, remediationRun.runId);
    stdout.write("PBOS RESUMING EXISTING FUNCTIONAL BUILD\n");
    stdout.write(`Run: ${productionRun.runId}\nPull request: ${remediationRun.pullRequest.url}\n`);
    stdout.write(`Validation monitor: PID ${job.pid}\nMonitor log: ${job.logPath}\n`);
    stdout.write("Live telemetry is attached here; PBOS will not create a duplicate branch or pull request.\n");
    const telemetry = await streamProductionTelemetry(services.state, productionRun.runId);
    if (telemetry !== "AWAITING_APPROVAL") return telemetry === "BLOCKED" ? 1 : 0;
    const currentRemediation = services.state.remediationRun(remediationRun.runId);
    const mission = services.state.missionQueue(systemId).find(item => item.title === productionRun.selectedMission);
    if (!currentRemediation || currentRemediation.state !== "READY_FOR_CERTIFICATION" ||
        !currentRemediation.evidence.some(item => item.state === "PASSED") || !mission) {
        throw new Error("Production validation reached approval without matching passed pull-request evidence and mission lineage.");
    }
    const promoted = await promptForValidatedMissionPromotion(services, session, mission, productionRun.runId, currentRemediation);
    return promoted ? runNextProductionMission(target) : 0;
}

async function runNextProductionMission(target?: string): Promise<number> {
    const services = runtime();
    await ensureGitHubAuthentication(profile());
    const requestedSystemId = systemIdFor(target);
    if (target && !requestedSystemId) throw new Error("Production run target must be playbook or bulletproof.");
    const selectedSystemId = requestedSystemId ?? services.state.missionQueue().find(item => item.status === "ELIGIBLE")?.systemId
        ?? "PLAYBOOK-SYSTEM-001";
    const resumed = await resumeExistingProductionValidation(services, selectedSystemId, target);
    if (resumed !== undefined) return resumed;
    const bootstrappedInspection = await ensureReadinessQueue(services, selectedSystemId,
        message => stdout.write(`[READINESS] ${message}\n`));
    const candidates = services.state.missionQueue(selectedSystemId);
    const next = new GovernedMissionQueue().next(candidates);
    if (!next) {
        const incomplete = candidates.filter(item => item.status !== "COMPLETE");
        if (candidates.length > 0 && incomplete.length === 0) {
            stdout.write("PBOS BUILD MISSION QUEUE COMPLETE\nAll governed missions are complete. Review exact-commit web/mobile previews and release certification before public launch.\n");
            return 0;
        }
        throw new Error(`No eligible production mission. ${incomplete.length} queued or blocked mission(s) have unsatisfied dependencies.`);
    }
    const system = services.state.systems().find(item => item.systemId === next.systemId);
    if (!system) throw new Error(`Registered system not found for mission ${next.missionId}.`);
    const [owner, name] = system.repository.split("/");
    if (!owner || !name) throw new Error(`Invalid repository identity: ${system.repository}`);
    const repository = { owner, name, defaultBranch: system.defaultBranch };
    stdout.write(`[DISCOVERY] Resolving ${system.repository} at its governed revision…\n`);
    const inspection = bootstrappedInspection ?? await services.gateway.inspectRepository(repository);
    if (next.missionId === "048-scholar-slice") {
        const workingDirectory = await services.gateway.workingDirectory(repository);
        const staging = await inspectPlaybookScholarStagingReadiness(workingDirectory);
        const readiness = staging.environment;
        const additiveBootstrapReady = isAdditiveScholarMigrationEligible(staging);
        if (!staging.ready && !additiveBootstrapReady) {
            stdout.write("[PREREQUISITE] Protected Scholar acceptance configuration is incomplete.\n");
            stdout.write(`Available: ${readiness.available.length}/${readiness.required.length}\n`);
            stdout.write(`Missing: ${readiness.missing.join(", ")}\n`);
            if (staging.blockers.length) stdout.write(`Staging blockers: ${staging.blockers.join(", ")}\n`);
            stdout.write("No approval was consumed and no repository changes were started.\n");
            stdout.write("NEXT HUMAN STEP: securely configure missing values or authorize the governed staging migration, then rerun the same PBOS build command.\n");
            stdout.write("Setup details: npm run pbos:doctor -- playbook\n");
            return 2;
        }
        stdout.write(`[PREREQUISITE] Protected Scholar acceptance configuration ready (${readiness.available.length}/${readiness.required.length}); values remain hidden.\n`);
        if (additiveBootstrapReady) {
            const migrationEnvironment = await inspectPlaybookStagingMigrationReadiness(workingDirectory);
            if (!migrationEnvironment.ready) {
                stdout.write(`[PREREQUISITE] Governed staging migration cannot start. Missing: ${migrationEnvironment.missing.join(", ")}\n`);
                stdout.write("No approval was consumed and no repository changes were started.\n");
                stdout.write("NEXT HUMAN STEP: add the named value to the protected mode-0600 Playbook acceptance file, then rerun the same command.\n");
                return 2;
            }
            stdout.write("[PREREQUISITE] The Scholar schema is absent or partially initialized. PBOS will generate the governed idempotent migrations, request protected staging approval, and verify every table before functional acceptance.\n");
        }
    }
    if (next.missionId === "048-academic-journey") {
        const workingDirectory = await services.gateway.workingDirectory(repository);
        const readiness = await inspectPlaybookAcademicAcceptanceReadiness(workingDirectory);
        if (!readiness.ready) {
            stdout.write("[PREREQUISITE] Protected academic-journey acceptance configuration is incomplete.\n");
            stdout.write(`Available: ${readiness.available.length}/${readiness.required.length}\n`);
            stdout.write(`Missing: ${readiness.missing.join(", ")}\n`);
            stdout.write("No repository changes were started and the durable mission approval remains auditable.\n");
            stdout.write("NEXT HUMAN STEP: add only the named values to the accepted mode-0600 Playbook acceptance file, then rerun the same PBOS command.\n");
            return 2;
        }
        stdout.write(`[PREREQUISITE] Protected academic acceptance configuration ready (${readiness.available.length}/${readiness.required.length}); values remain hidden.\n`);
    }
    if (next.missionId === "048-web-staging") {
        const readiness = await inspectPlaybookWebStagingReadiness();
        if (!readiness.ready) {
            stdout.write("[PREREQUISITE] Protected Vercel preview configuration is incomplete.\n");
            stdout.write(`Available: ${readiness.available.length}/${readiness.required.length}\n`);
            stdout.write(`Missing: ${readiness.missing.join(", ")}\n`);
            playbookWebStagingProtectedEnvironmentFiles().forEach(source =>
                stdout.write(`Accepted mode-0600 source: ${source.path}\n`));
            stdout.write("No approval was consumed, no deployment was started, and no repository changes were made.\n");
            stdout.write("NEXT HUMAN STEP: add only the named Vercel values to the protected file, run chmod 600 on it, then rerun the same PBOS command.\n");
            stdout.write("Setup details: npm run pbos:doctor -- playbook\n");
            return 2;
        }
        stdout.write(`[PREREQUISITE] Protected Vercel preview configuration ready (${readiness.available.length}/${readiness.required.length}); values remain hidden.\n`);
    }
    if (["049-store-readiness", "049-certification"].includes(next.missionId)) {
        const readiness = await inspectPlaybookMobileReleaseReadiness();
        if (!readiness.ready) {
            stdout.write("[PREREQUISITE] Protected EAS mobile-release configuration is incomplete.\n");
            stdout.write(`Available: ${readiness.available.length}/${readiness.required.length}\n`);
            stdout.write(`Missing: ${readiness.missing.join(", ")}\n`);
            playbookMobileReleaseProtectedEnvironmentFiles().forEach(source =>
                stdout.write(`Accepted mode-0600 source: ${source.path}\n`));
            stdout.write("No approval was consumed, no mobile build or store submission was started, and no repository changes were made.\n");
            stdout.write("NEXT HUMAN STEP: configure only the named Expo project values, verify remotely managed iOS/Android credentials, run chmod 600 on the file, then rerun the same PBOS command.\n");
            stdout.write("Setup details: npm run pbos:doctor -- playbook\n");
            return 2;
        }
        stdout.write(`[PREREQUISITE] Protected EAS release configuration ready (${readiness.available.length}/${readiness.required.length}); values remain hidden.\n`);
    }
    if (next.missionId === "050-platform-evidence") {
        const readiness = inspectEcosystemEvidenceReadiness();
        if (!readiness.ready) {
            stdout.write("[PREREQUISITE] CIP-050 independent multi-platform evidence is incomplete.\n");
            stdout.write(`Evidence source: ${readiness.path}\n`);
            stdout.write(`Reason: ${readiness.reason ?? readiness.status ?? "NOT_READY"}\n`);
            stdout.write("No production run was started and no application repository was changed.\n");
            stdout.write("NEXT PBOS STEP: finish the missing Playbook or Bulletproof web/iOS/Android scorecard evidence and independent approvals, then rerun the same command.\n");
            return 2;
        }
        stdout.write(`[PREREQUISITE] CIP-050 two-system platform evidence ready (${readiness.status}); exact repository lineage will now be verified.\n`);
    }
    let missionApproval = durableMissionApproval(services, next);
    if (next.approvalRequired && !missionApproval) {
        const io = new NodeTerminalIO();
        try {
            missionApproval = await promptForMissionApproval(io, services, next);
        } finally {
            io.close();
        }
        if (!missionApproval) return 0;
    }
    const approval = services.identities.approve(services.operator, "START_PRODUCTION_RUN", next.missionId, 30);
    if (!services.identities.verify(approval, "START_PRODUCTION_RUN", next.missionId)) {
        throw new Error("Production-run approval verification failed.");
    }
    services.state.appendAudit({ eventId: approval.approvalId, type: "VERIFIABLE_APPROVAL",
        actorId: services.operator.operatorId, resource: next.missionId, occurredAt: approval.issuedAt, evidence: { approval } });
    stdout.write(`[AUTHORIZED] ${next.title}${missionApproval ? ` — signed mission approval ${missionApproval.approvalId}` : ""}\n`);
    const runner = new ProductionMissionRunner(services.state, services.production,
        (stage, message) => stdout.write(`[${stage}] ${message}\n`));
    const session = [...services.state.sessions()].reverse().find(item => item.system.systemId === next.systemId && item.grant.mode !== "READ_ONLY" &&
        !item.grant.revokedAt && item.grant.expiresAt.getTime() > Date.now());
    if (!session) throw new Error(`No active governed build session exists for ${system.name}. Run: pbos build ${target ?? "playbook"}`);
    const contracts = connectorContracts(next.systemId);
    const channel = new GenesisPbosBuildChannel().open({
        target: { systemId: system.systemId, operatingSystemId: system.operatingSystemId,
            repository: system.repository, defaultBranch: system.defaultBranch },
        session: { sessionId: session.sessionId, systemId: session.system.systemId, repository: session.system.repository },
        grant: { grantId: session.grant.grantId, systemId: session.grant.systemId,
            repository: session.grant.repository, mode: session.grant.mode },
        connector: contracts.connector, domains: contracts.domains
    });
    stdout.write(`[BUILD_CHANNEL] ${channel.factory} → ${channel.runtime} → ${system.name}\n`);
    stdout.write(`[PBOS_V1] ${channel.operatingSystemId} | ${channel.connectorId} | domains ${channel.domainRegistrationIds.join(", ")}\n`);
    stdout.write(`[REPOSITORY] ${channel.repository}@${inspection.revision} | branch boundary agent/*\n`);
    const adapters = new ProductionMissionAdapterRegistry()
        .register("PLAYBOOK-SYSTEM-001", "048-repository-gap-analysis", () => repositoryGapAnalysisExecutor(services.gateway, repository, inspection))
        .register("PLAYBOOK-SYSTEM-001", "048-foundation", () => playbookFoundationExecutor({ gateway: services.gateway,
            remediation: services.remediation, session,
            authorize: (action, risk, branch) => services.control.authorizeAction(session.sessionId, action, risk, branch) }))
        .register("PLAYBOOK-SYSTEM-001", "048-scholar-slice", () => playbookScholarSliceExecutor({ gateway: services.gateway,
            remediation: services.remediation, session,
            authorize: (action, risk, branch) => services.control.authorizeAction(session.sessionId, action, risk, branch) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "048-academic-journey", () => playbookAcademicJourneyExecutor({ gateway: services.gateway,
            remediation: services.remediation, session,
            authorize: (action, risk, branch) => services.control.authorizeAction(session.sessionId, action, risk, branch) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "048-opportunity-journey", () => playbookOpportunityJourneyExecutor({ gateway: services.gateway,
            remediation: services.remediation, session,
            authorize: (action, risk, branch) => services.control.authorizeAction(session.sessionId, action, risk, branch) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "048-application-journey", () => playbookApplicationJourneyExecutor({ gateway: services.gateway,
            remediation: services.remediation, session,
            authorize: (action, risk, branch) => services.control.authorizeAction(session.sessionId, action, risk, branch) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "048-support-journey", () => playbookSupportJourneyExecutor({ gateway: services.gateway,
            remediation: services.remediation, session,
            authorize: (action, risk, branch) => services.control.authorizeAction(session.sessionId, action, risk, branch) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "048-messaging-journey", () => playbookMessagingJourneyExecutor({ gateway: services.gateway,
            remediation: services.remediation, session,
            authorize: (action, risk, branch) => services.control.authorizeAction(session.sessionId, action, risk, branch) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "048-notification-journey", () => playbookNotificationJourneyExecutor({ gateway: services.gateway,
            remediation: services.remediation, session,
            authorize: (action, risk, branch) => services.control.authorizeAction(session.sessionId, action, risk, branch) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "048-product-journeys", () => playbookProductJourneysExecutor({ gateway: services.gateway,
            remediation: services.remediation, session,
            authorize: (action, risk, branch) => services.control.authorizeAction(session.sessionId, action, risk, branch) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "048-web-staging", () => playbookWebStagingExecutor({ gateway: services.gateway,
            remediation: services.remediation, session, deploymentApprovalId: missionApproval?.approvalId ?? "",
            authorize: (action, risk, branch, explicitApprovalId) =>
                services.control.authorizeAction(session.sessionId, action, risk, branch, explicitApprovalId) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "049-mobile-foundation", () => playbookMobileFoundationExecutor({
            gateway: services.gateway, remediation: services.remediation, session,
            authorize: (action, risk, branch) => services.control.authorizeAction(session.sessionId, action, risk, branch) }))
        .register("PLAYBOOK-SYSTEM-001", "049-mobile-journeys", () => playbookMobileJourneysExecutor({
            gateway: services.gateway, remediation: services.remediation, session,
            authorize: (action, risk, branch) => services.control.authorizeAction(session.sessionId, action, risk, branch) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "049-store-readiness", () => playbookMobileStoreReadinessExecutor({
            gateway: services.gateway, remediation: services.remediation, session,
            deploymentApprovalId: missionApproval?.approvalId ?? "",
            authorize: (action, risk, branch, explicitApprovalId) =>
                services.control.authorizeAction(session.sessionId, action, risk, branch, explicitApprovalId) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "049-certification", () => playbookMobileCertificationExecutor({
            gateway: services.gateway, remediation: services.remediation, session, state: services.state,
            deploymentApprovalId: missionApproval?.approvalId ?? "",
            verifyHistoricalApproval: (historical, action, resource) =>
                services.identities.verify(historical, action, resource, new Date(historical.issuedAt)),
            authorize: (action, risk, branch, explicitApprovalId) =>
                services.control.authorizeAction(session.sessionId, action, risk, branch, explicitApprovalId) }),
            { producesFunctionalAcceptancePlan: true })
        .register("PLAYBOOK-SYSTEM-001", "050-platform-evidence", () => ecosystemPlatformEvidenceExecutor({
            gateway: services.gateway, state: services.state }));
    const coverage = adapters.coverage(candidates.filter(item => item.status !== "COMPLETE"));
    stdout.write(`[EXECUTION_ADAPTERS] ${coverage.registered.length} ready${coverage.missing.length ? ` | future missions pending adapters: ${coverage.missing.join(", ")}` : " | complete coverage"}\n`);
    const sequence = await runner.run({ systemId: next.systemId, actorId: services.operator.operatorId,
        authorizationArtifactId: approval.approvalId, repository: system.repository, branch: system.defaultBranch,
        commit: inspection.revision, approvedMissionIds: missionApproval ? [next.missionId] : [], autonomousContinuation: true,
        triggerSource: "CLI", buildChannel: channel }, mission => adapters.resolve(mission));
    sequence.runs.forEach(run => stdout.write(`[RESULT] ${run.runId} — ${run.status} — ${run.durationMs ?? 0}ms\n`));
    stdout.write(`AUTONOMOUS STOP: ${sequence.stopReason}\n`);
    let continueAfterApproval = false;
    if (sequence.stopReason === "VALIDATION_IN_PROGRESS") {
        const activeRun = sequence.runs.at(-1);
        const remediationId = activeRun ? services.production.run(activeRun.runId)?.evidenceIds
            .find(item => item.startsWith("remediation-run:"))?.slice("remediation-run:".length) : undefined;
        if (!activeRun || !remediationId) {
            throw new Error("Deferred validation cannot start without durable production and remediation linkage.");
        }
        const stagingDefinition = playbookStagingMigrationDefinition(next.missionId);
        if (stagingDefinition) {
            try {
                const migration = await migratePlaybookStaging(remediationId, stagingDefinition.missionId);
                if (migration !== 0) {
                    services.production.pause(activeRun.runId, activeRun.actorId);
                    stdout.write("PBOS PAUSED AT PROTECTED STAGING GATE. The exact application run remains durable and will resume without creating a duplicate pull request.\n");
                    return migration;
                }
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                services.production.blockMissionForRun(activeRun.runId, reason);
                services.production.transition(activeRun.runId, "BLOCKED", "Protected Scholar staging preparation failed.", { reason });
                throw error;
            }
        }
        const background = new BackgroundProcessLauncher(join(__dirname, "..", "..", "bin", "pbos.js"),
            services.state, join(stateRoot, "logs"));
        const job = background.launch(next.systemId, session.sessionId, remediationId);
        stdout.write(`Validation monitor: PID ${job.pid}\nMonitor log: ${job.logPath}\n`);
        stdout.write("PBOS CONTINUES: GitHub validation and bounded remediation are running durably.\n");
        stdout.write("Live telemetry remains attached in this terminal. Press Ctrl-C only if you want to detach; background monitoring will continue.\n");
        if (activeRun) {
            const telemetryResult = await streamProductionTelemetry(services.state, activeRun.runId);
            if (telemetryResult === "AWAITING_APPROVAL") {
                const remediationId = services.production.run(activeRun.runId)?.evidenceIds
                    .find(item => item.startsWith("remediation-run:"))?.slice("remediation-run:".length);
                const remediationRun = remediationId ? services.state.remediationRun(remediationId) : undefined;
                if (!remediationRun || remediationRun.state !== "READY_FOR_CERTIFICATION") {
                    throw new Error("Production validation reached approval without matching green pull-request evidence.");
                }
                if (await promptForValidatedMissionPromotion(services, session, next, activeRun.runId, remediationRun)) {
                    return runNextProductionMission(target);
                }
            }
        }
    }
    if (sequence.nextMission) {
        stdout.write(`NEXT MISSION: ${sequence.nextMission.title}\n`);
        stdout.write(`WHY: ${sequence.nextMission.rationale}\n`);
        stdout.write(`HUMAN APPROVAL REQUIRED: ${sequence.nextMission.approvalRequired ? "YES" : "NO"}\n`);
        if (sequence.stopReason === "APPROVAL_REQUIRED" && sequence.nextMission.approvalRequired) {
            const io = new NodeTerminalIO();
            try {
                const nextApproval = await promptForMissionApproval(io, services, sequence.nextMission);
                if (nextApproval) {
                    io.write("PBOS CONTINUES: the signed mission decision is durable and its execution adapter is registered.");
                    io.write("The same terminal will now advance into governed execution; no additional command is required.");
                    continueAfterApproval = true;
                }
            } finally {
                io.close();
            }
        }
    }
    if (sequence.stopReason === "NO_EXECUTION_ADAPTER" && sequence.nextMission) {
        stdout.write("PBOS EXECUTION BLOCKED: this authorized mission does not yet have a certified execution adapter.\n");
        stdout.write("No repository changes were started and the approval remains auditable.\n");
    }
    if (continueAfterApproval) return runNextProductionMission(target);
    return sequence.stopReason === "NO_EXECUTION_ADAPTER" ? 1 : 0;
}

async function buildApplication(target: string): Promise<number> {
    const systemId = systemIdFor(target);
    if (!systemId) throw new Error("Build target must be playbook or bulletproof.");
    const services = runtime();
    const system = services.state.systems().find(item => item.systemId === systemId);
    if (!system) throw new Error(`Registered application not found: ${systemId}`);
    const reusable = [...services.state.sessions()].reverse().find(item => item.system.systemId === systemId &&
        item.grant.mode !== "READ_ONLY" && !item.grant.revokedAt && item.grant.expiresAt.getTime() > Date.now());
    stdout.write("PBOS GENESIS AUTONOMOUS APPLICATION BUILD\n");
    stdout.write(`Factory: PBOS Genesis\nOperating system: ${system.operatingSystemId} on PBOS v1\nApplication: ${system.name}\nRepository: ${system.repository}\n`);
    if (reusable) {
        stdout.write(`Authority: reusing ${reusable.grant.mode} session ${reusable.sessionId}\n`);
    } else {
        stdout.write("Authority requested: Delegated Autonomous Build\n");
        stdout.write("Protected gates: merge, production deployment, secrets, destructive migration, certification, and cross-repository work\n");
        const io = new NodeTerminalIO();
        try {
            const answer = (await io.prompt("Authorize the governed build channel and run to the next protected gate? [y/N] ")).trim().toLowerCase();
            if (answer !== "y" && answer !== "yes") {
                io.write("Build channel not authorized. No repository changes were started.");
                return 0;
            }
            const identity = await services.sessionAuthority.authorize(systemId);
            const session = services.control.activateSystem(systemId, "DELEGATED_AUTONOMY", identity.operatorId, identity.approvalId);
            io.write(`Build channel authorized: session ${session.sessionId}`);
        } finally {
            io.close();
        }
    }
    return runNextProductionMission(target);
}

async function waitForPlaybookMissionTables(baseUrl: string, serviceRoleKey: string,
    definition: PlaybookStagingMigrationDefinition, maximumAttempts = 8): Promise<readonly string[]> {
    let blockers: string[] = [];
    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
        blockers = [];
        for (const table of definition.tableNames) {
            try {
                const response = await fetch(new URL(`/rest/v1/${table}?select=*&limit=0`, baseUrl), {
                    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
                    signal: AbortSignal.timeout(10_000)
                });
                if (!response.ok) blockers.push(`${table}:HTTP_${response.status}`);
            } catch (error) {
                blockers.push(`${table}:${error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : "UNREACHABLE"}`);
            }
        }
        if (!blockers.length) return [];
        if (attempt + 1 < maximumAttempts) await new Promise(resolve => setTimeout(resolve, Math.min(500 * (2 ** attempt), 5_000)));
    }
    return blockers;
}

async function migratePlaybookStaging(remediationRunId?: string,
    missionId: PlaybookStagingMigrationDefinition["missionId"] = "048-scholar-slice"): Promise<number> {
    const services = runtime();
    const system = services.state.systems().find(item => item.systemId === "PLAYBOOK-SYSTEM-001");
    if (!system) throw new Error("The Playbook is not registered in the Genesis system catalog.");
    const session = [...services.state.sessions()].reverse().find(item => item.system.systemId === system.systemId &&
        item.grant.mode !== "READ_ONLY" && !item.grant.revokedAt && item.grant.expiresAt.getTime() > Date.now());
    if (!session) throw new Error("A governed Playbook build session is required before staging migration.");
    const [owner, name] = system.repository.split("/");
    if (!owner || !name) throw new Error(`Invalid repository identity: ${system.repository}`);
    const reference = { owner, name, defaultBranch: system.defaultBranch };
    const remediation = remediationRunId
        ? services.state.remediationRun(remediationRunId)
        : [...services.state.remediationRuns()].reverse().find(item => item.systemId === system.systemId);
    if (!remediation || remediation.systemId !== system.systemId || remediation.pullRequest.repository !== system.repository) {
        throw new Error("Staging migration requires the exact active Playbook remediation lineage.");
    }
    if (!remediation.pullRequest.branch.startsWith("agent/")) {
        throw new Error("Staging migration requires an active governed agent branch.");
    }
    const productionRun = [...services.state.productionRuns()].reverse().find(item =>
        item.systemId === system.systemId && item.evidenceIds.includes(`remediation-run:${remediation.runId}`));
    if (!productionRun || productionRun.repository !== system.repository ||
        productionRun.currentBranch !== remediation.pullRequest.branch || !/^[a-f0-9]{7,40}$/i.test(productionRun.currentCommit)) {
        throw new Error("Staging migration cannot resolve exact production-run repository lineage.");
    }
    const definition = playbookStagingMigrationDefinition(missionId);
    if (!definition) throw new Error(`No governed Playbook staging migration is registered for ${missionId}.`);
    await services.gateway.checkoutPullRequest(reference, remediation.pullRequest.number);
    const checkedOutRevision = await services.gateway.currentRevision(reference);
    if (checkedOutRevision !== productionRun.currentCommit) {
        throw new Error(`Staging migration lineage mismatch: PBOS authorized ${productionRun.currentCommit}, but the pull request resolved to ${checkedOutRevision}.`);
    }
    const workingDirectory = await services.gateway.workingDirectory(reference);
    const alreadyApplied = services.state.audit().some(event => event.type === "STAGING_MIGRATION_APPLIED" &&
        event.evidence.missionId === definition.missionId && event.evidence.commit === productionRun.currentCommit);
    if (alreadyApplied) {
        stdout.write(`PBOS ${definition.label} staging schema is already applied at this exact revision; no migration was repeated.\n`);
        return 0;
    }
    const before = definition.missionId === "048-scholar-slice"
        ? await inspectPlaybookScholarStagingReadiness(workingDirectory) : undefined;
    if (before?.ready) {
        stdout.write("PBOS Playbook staging schema is already ready; no migration was applied.\n");
        return 0;
    }
    if (before && !isAdditiveScholarMigrationEligible(before)) {
        throw new Error(`Staging migration is not eligible for automatic bootstrap: ${before.blockers.join(", ")}.`);
    }
    const migrationReadiness = await inspectPlaybookStagingMigrationReadiness(workingDirectory);
    if (!migrationReadiness.ready) {
        stdout.write(`PBOS staging migration is missing protected configuration: ${migrationReadiness.missing.join(", ")}.\n`);
        stdout.write("Add only the named value to the accepted mode-0600 protected file; no secret value was displayed or persisted.\n");
        return 2;
    }
    const environment = await new ProtectedEnvironmentResolver().resolve([{
        command: "pbos-staging-migration", args: [],
        requiredEnvironmentVariables: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ACCESS_TOKEN"]
    }], playbookScholarProtectedEnvironmentFiles(workingDirectory));
    const projectRef = new URL(environment.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
    const branch = remediation.pullRequest.branch;
    const io = new NodeTerminalIO();
    let authorized = false;
    try {
        io.write("");
        io.write("PBOS PROTECTED STAGING MIGRATION CHECKPOINT");
        io.write(`Application: ${system.name}`);
        io.write(`Project: ${projectRef}`);
        io.write(`Mission: ${definition.missionId}`);
        io.write(`Scope: apply only the ${definition.migrationPaths.length} additive ${definition.label} migration${definition.migrationPaths.length === 1 ? "" : "s"} in one atomic transaction.`);
        io.write("Production, destructive SQL, secrets, and unrelated schemas remain excluded.");
        const answer = (await io.prompt("Authorize this Playbook staging migration now? [y/N] ")).trim().toLowerCase();
        authorized = answer === "y" || answer === "yes";
    } finally { io.close(); }
    if (!authorized) {
        stdout.write("Staging migration not authorized; no external state changed.\n");
        return 2;
    }
    const resource = `supabase:${projectRef}`;
    const approval = services.identities.approve(services.operator, "APPLY_STAGING_MIGRATION", resource, 10);
    if (!services.identities.verify(approval, "APPLY_STAGING_MIGRATION", resource)) {
        throw new Error("Staging migration approval verification failed.");
    }
    const decision = services.control.authorizeAction(session.sessionId, "APPLY_STAGING_MIGRATION", "HIGH", branch,
        approval.approvalId);
    if (!decision.allowed) throw new Error(`Staging migration denied: ${decision.reason}`);
    services.state.appendAudit({ eventId: approval.approvalId, type: "VERIFIABLE_APPROVAL",
        actorId: services.operator.operatorId, resource, occurredAt: approval.issuedAt,
        evidence: { approval, purpose: "APPLY_STAGING_MIGRATION" } });
    const result = await new PlaybookStagingMigrationService(services.state).apply({ workingDirectory, projectRef,
        accessToken: environment.SUPABASE_ACCESS_TOKEN!, approvalId: approval.approvalId,
        actorId: services.operator.operatorId, repository: productionRun.repository,
        branch: productionRun.currentBranch, commit: productionRun.currentCommit, definition });
    stdout.write("[VERIFYING] Migration committed; waiting for the Supabase Data API schema cache to expose the governed tables.\n");
    const blockers = await waitForPlaybookMissionTables(environment.NEXT_PUBLIC_SUPABASE_URL!,
        environment.SUPABASE_SERVICE_ROLE_KEY!, definition);
    if (blockers.length) throw new Error(`Migration committed and requested a schema-cache reload, but bounded staging verification failed: ${blockers.join(", ")}.`);
    stdout.write(`PBOS staging migration complete: ${result.migrationId}\n`);
    stdout.write(`Verified governed tables: ${definition.tableNames.length}/${definition.tableNames.length}\n`);
    stdout.write("PBOS CONTINUES: the verified staging schema is ready for exact-revision functional acceptance.\n");
    return 0;
}

async function launch(preselectedSystemId?: string): Promise<number> {
    const services = runtime();
    const unfinished = latestUnfinishedRuns(services.state.remediationRuns());
    if (unfinished.length) stdout.write(`Unfinished build detected: ${unfinished.at(-1)!.systemId} (${unfinished.at(-1)!.state}). PBOS will resume durable monitoring automatically.\n`);
    const background = new BackgroundProcessLauncher(join(__dirname, "..", "..", "bin", "pbos.js"), services.state, join(stateRoot, "logs"));
    for (const run of unfinished) {
        const batch = [...services.state.autonomousBatches()].reverse().find(item => item.runId === run.runId);
        const session = batch
            ? services.state.sessions().find(item => item.sessionId === batch!.sessionId)
            : [...services.state.sessions()].reverse().find(item => item.system.systemId === run.systemId);
        if (session) {
            const job = background.launch(run.systemId, session.sessionId, run.runId);
            stdout.write(`${batch ? "Resumed autonomous batch monitor" : "Resumed pre-batch validation without inferring package completion"} for ${run.systemId}: PID ${job.pid}\n`);
        }
    }
    const continuity = new OperatorContinuityService(services.remediation, services.memos, background);
    return new GenesisTerminal(services.control, new NodeTerminalIO(), new SystemIntakeTerminal(undefined, blueprint => services.state.saveBlueprint(blueprint)),
        services.sessionAuthority, services.workflows, services.remediation, continuity, services.batches).run(preselectedSystemId);
}

export async function runPbosCli(args = process.argv.slice(2)): Promise<number> {
    if (args[0] === "login") return login();
    if (args[0] === "status") {
        const local = profile();
        const state = new GenesisStateRepository(genesisPath);
        const production = new ProductionRuntimeService(state);
        const snapshot = production.snapshot();
        const runs = latestRunsBySystem(state.remediationRuns());
        stdout.write(`Authenticated organization: ${local.organizationId}\nGitHub account: ${local.githubLogin}\nOperator: ${local.operatorId}\n`);
        stdout.write(`PBOS production: ${snapshot.activeRun ? "ACTIVE" : "IDLE"} — ${snapshot.status}\n`);
        if (snapshot.activeRun) {
            const elapsed = Date.now() - Date.parse(snapshot.activeRun.startedAt);
            stdout.write(`Active run: ${snapshot.activeRun.runId}\nMission: ${snapshot.activeRun.selectedMission}\nStage: ${snapshot.activeStage?.title ?? "Transitioning"}\nElapsed: ${Math.max(0, elapsed)}ms\nHeartbeat: ${snapshot.activeRun.lastHeartbeatAt}\n`);
        } else if (snapshot.lastRun) stdout.write(`Last production result: ${snapshot.lastRun.status} — ${snapshot.lastRun.terminalSummary ?? snapshot.lastRun.selectedMission}\n`);
        stdout.write(`Health: ${snapshot.health.health}\nNext mission: ${snapshot.nextMission?.title ?? "NONE"}\n`);
        runs.forEach(run => {
            stdout.write(`Validation: ${run.systemId} — PR #${run.pullRequest.number} — ${effectiveRemediationState(run)}\n`);
            const job = state.backgroundJobForRun(run.runId);
            if (job) stdout.write(`Monitor: ${run.systemId} — ${job.status} — PID ${job.pid}\n`);
            const batch = [...state.autonomousBatches()].reverse().find(item => item.runId === run.runId);
            if (batch) stdout.write(`Batch: ${batch.systemId} — ${batch.state} — ${batch.workPackages.length}/${batch.packageLimit} packages\n`);
        });
        return 0;
    }
    if (args[0] === "doctor") {
        profile();
        const selectedSystemId = systemIdFor(args[1] ?? "playbook");
        if (selectedSystemId !== "PLAYBOOK-SYSTEM-001") {
            throw new Error("No protected acceptance doctor is registered for that application yet.");
        }
        const services = runtime();
        const system = services.state.systems().find(item => item.systemId === selectedSystemId)!;
        const [owner, name] = system.repository.split("/");
        const workingDirectory = await services.gateway.workingDirectory({ owner, name, defaultBranch: system.defaultBranch });
        const files = playbookScholarProtectedEnvironmentFiles(workingDirectory);
        const staging = await inspectPlaybookScholarStagingReadiness(workingDirectory);
        const migration = await inspectPlaybookStagingMigrationReadiness(workingDirectory);
        const webStaging = await inspectPlaybookWebStagingReadiness();
        const mobileRelease = await inspectPlaybookMobileReleaseReadiness();
        const ecosystemEvidence = inspectEcosystemEvidenceReadiness();
        const readiness = staging.environment;
        stdout.write("PBOS PROTECTED ACCEPTANCE DOCTOR\n");
        stdout.write(`Application: ${system.name}\nRepository: ${system.repository}\n`);
        files.forEach(source => stdout.write(`Accepted source: ${source.path}\n`));
        stdout.write(`Available: ${readiness.available.length}/${readiness.required.length}\n`);
        stdout.write(`Missing: ${readiness.missing.length ? readiness.missing.join(", ") : "NONE"}\n`);
        staging.resources.forEach(resource => stdout.write(`Resource: ${resource.resource} — ${resource.ready ? "READY" : "BLOCKED"} — ${resource.status}\n`));
        stdout.write("\nPBOS WEB PREVIEW PROVIDER\n");
        playbookWebStagingProtectedEnvironmentFiles().forEach(source =>
            stdout.write(`Accepted source: ${source.path}\n`));
        stdout.write(`Available: ${webStaging.available.length}/${webStaging.required.length}\n`);
        stdout.write(`Missing: ${webStaging.missing.length ? webStaging.missing.join(", ") : "NONE"}\n`);
        stdout.write(webStaging.ready
            ? "WEB STAGING: READY — Vercel configuration names were verified without displaying values.\n"
            : "WEB STAGING: BLOCKED — add only the missing Vercel values to the accepted mode-0600 source.\n");
        stdout.write("\nPBOS MOBILE RELEASE PROVIDER\n");
        playbookMobileReleaseProtectedEnvironmentFiles().forEach(source =>
            stdout.write(`Accepted source: ${source.path}\n`));
        stdout.write(`Available: ${mobileRelease.available.length}/${mobileRelease.required.length}\n`);
        stdout.write(`Missing: ${mobileRelease.missing.length ? mobileRelease.missing.join(", ") : "NONE"}\n`);
        stdout.write(mobileRelease.ready
            ? "MOBILE RELEASE: READY — Expo configuration names were verified without displaying values.\n"
            : "MOBILE RELEASE: BLOCKED — add only the missing Expo values to the accepted mode-0600 source.\n");
        stdout.write("\nPBOS CIP-050 MULTI-PLATFORM EVIDENCE\n");
        stdout.write(`Accepted source: ${ecosystemEvidence.path}\n`);
        stdout.write(ecosystemEvidence.ready
            ? `ECOSYSTEM EVIDENCE: READY — ${ecosystemEvidence.status}; governed revisions are rechecked during execution.\n`
            : `ECOSYSTEM EVIDENCE: BLOCKED — ${ecosystemEvidence.reason ?? ecosystemEvidence.status ?? "NOT_READY"}\n`);
        const missingTables = staging.resources.filter(resource => resource.resource.startsWith("table:") && !resource.ready);
        const migrationBootstrapReady = isAdditiveScholarMigrationEligible(staging) && migration.ready;
        if (missingTables.length) {
            stdout.write(`Migration authority: ${migration.ready ? "READY" : "BLOCKED"}` +
                `${migration.missing.length ? ` — missing ${migration.missing.join(", ")}` : ""}\n`);
        }
        stdout.write(staging.ready
            ? "READINESS: READY — protected values and staging resources were verified without displaying secrets.\n"
            : migrationBootstrapReady
                ? "READINESS: READY_FOR_GOVERNED_MIGRATION — the additive Scholar schema and its protected migration authority are ready for the in-terminal approval checkpoint.\n"
                : `READINESS: BLOCKED — ${staging.blockers.join(", ") || "add the missing protected values"}` +
                    `${missingTables.length && !migration.ready ? `; migration configuration missing ${migration.missing.join(", ")}` : ""}.\n`);
        return staging.ready || migrationBootstrapReady ? 0 : 2;
    }
    if (args[0] === "health") {
        profile();
        const production = new ProductionRuntimeService(new GenesisStateRepository(genesisPath));
        const health = production.health();
        stdout.write(`${JSON.stringify(health, null, 2)}\n`); return health.health === "UNHEALTHY" ? 1 : 0;
    }
    if (args[0] === "constitution") {
        const report = await new ConstitutionalAuthorityLoader(join(__dirname, "..", "..")).inspect();
        stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return report.state === "READY" ? 0 : 2;
    }
    if (args[0] === "history") {
        profile();
        const production = new ProductionRuntimeService(new GenesisStateRepository(genesisPath));
        production.history().forEach(run => stdout.write(`${run.runId} — ${run.status} — ${run.selectedMission} — ${run.durationMs ?? "active"}ms — ${run.currentCommit}\n`));
        return 0;
    }
    if (args[0] === "inspect") {
        profile(); const runId = args[1]; if (!runId) throw new Error("Run inspection requires a run ID.");
        const production = new ProductionRuntimeService(new GenesisStateRepository(genesisPath));
        const run = production.run(runId); if (!run) throw new Error(`Production run not found: ${runId}`);
        stdout.write(`${JSON.stringify({ run, events: production.events(runId) }, null, 2)}\n`); return 0;
    }
    if (args[0] === "next") {
        const services = runtime();
        const requestedSystemId = systemIdFor(args[1]);
        if (args[1] && !requestedSystemId) throw new Error("Next-mission target must be playbook or bulletproof.");
        await ensureReadinessQueue(services, requestedSystemId ?? "PLAYBOOK-SYSTEM-001",
            message => stdout.write(`[READINESS] ${message}\n`));
        const next = new GovernedMissionQueue().next(services.state.missionQueue(requestedSystemId ?? "PLAYBOOK-SYSTEM-001"));
        stdout.write(next ? `${next.missionId} — ${next.title}\nReason: ${next.rationale}\nApproval required: ${next.approvalRequired ? "YES" : "NO"}\n` : "No eligible mission.\n"); return 0;
    }
    if (args[0] === "run") return runNextProductionMission(args[1]);
    if (args[0] === "migrate") {
        const systemId = systemIdFor(args[1]);
        if (systemId !== "PLAYBOOK-SYSTEM-001") throw new Error("Staging migration currently supports only playbook.");
        return migratePlaybookStaging();
    }
    if (args[0] === "build") {
        if (!args[1]) throw new Error("Build requires an application target: playbook or bulletproof.");
        return buildApplication(args[1]);
    }
    if (["pause", "resume", "cancel"].includes(args[0] ?? "")) {
        const local = profile(); const runId = args[1]; if (!runId) throw new Error(`${args[0]} requires a run ID.`);
        const production = new ProductionRuntimeService(new GenesisStateRepository(genesisPath));
        const run = args[0] === "pause" ? production.pause(runId, local.operatorId)
            : args[0] === "resume" ? production.resume(runId, local.operatorId) : production.cancel(runId, local.operatorId);
        stdout.write(`${run.runId} — ${run.status}\n`); return 0;
    }
    if (args[0] === "verify") {
        profile(); const result = new ProductionRuntimeService(new GenesisStateRepository(genesisPath)).verifyIntegrity();
        stdout.write(`${JSON.stringify(result, null, 2)}\n`); return result.valid ? 0 : 1;
    }
    if (args[0] === "preview") {
        profile(); const state = new GenesisStateRepository(genesisPath); const manifest = state.previewManifests(args[1]).at(-1);
        stdout.write(manifest ? `${JSON.stringify(manifest, null, 2)}\n` : "No valid preview manifest is available.\n"); return manifest ? 0 : 1;
    }
    if (args[0] === "mission-control") {
        profile(); startMissionControl(); return await new Promise<number>(() => undefined);
    }
    if (args[0] === "watch") {
        profile();
        const requested = args[1];
        let last = "";
        const seenEvents = new Set<string>();
        const seenProductionEvents = new Set<string>();
        for (;;) {
            const state = new GenesisStateRepository(genesisPath);
            const production = new ProductionRuntimeService(state);
            const batch = [...state.autonomousBatches()].reverse().find(item => !requested || item.systemId === requested);
            if (!batch) throw new Error("No autonomous batch is available to watch.");
            const run = state.remediationRun(batch.runId);
            const line = `[${new Date().toISOString()}] ${batch.systemId} — ${batch.state} — ${batch.workPackages.length}/${batch.packageLimit} packages — validation ${run?.state ?? "UNKNOWN"}`;
            if (line.replace(/^\[[^\]]+\] /, "") !== last) {
                stdout.write(`${line}\nPR: ${batch.pullRequestUrl}\n`);
                last = line.replace(/^\[[^\]]+\] /, "");
            }
            state.batchTelemetry(batch.batchId).filter(event => !seenEvents.has(event.eventId)).forEach(event => {
                seenEvents.add(event.eventId);
                stdout.write(`${event.occurredAt} ${event.type}${event.workPackageId ? ` [${event.workPackageId}]` : ""}: ${event.title}\n  ${event.detail}\n`);
            });
            production.events(batch.batchId).filter(event => !seenProductionEvents.has(event.eventId)).forEach(event => {
                seenProductionEvents.add(event.eventId);
                stdout.write(`${event.timestamp} ${event.type}: ${event.summary}\n`);
            });
            const productionRun = production.run(batch.batchId);
            if (productionRun) {
                const stage = state.productionStages(batch.batchId).find(item => item.stageId === productionRun.activeStageId);
                stdout.write(`ACTIVE: ${productionRun.status} — ${stage?.title ?? "transitioning"} — elapsed ${Math.max(0, Date.now() - Date.parse(productionRun.startedAt))}ms — heartbeat ${productionRun.lastHeartbeatAt}\n`);
            }
            if (["READY_FOR_CERTIFICATION", "BLOCKED"].includes(batch.state)) return batch.state === "BLOCKED" ? 1 : 0;
            await new Promise(resolve => setTimeout(resolve, 5_000));
        }
    }
    if (args[0] === "memo") {
        profile();
        const latest = new OperatorMemoService(join(stateRoot, "memos"), new GenesisStateRepository(genesisPath)).latest(args[1]);
        if (!latest) throw new Error("No PBOS operator memo is available.");
        stdout.write(`${latest.content}\nMemo: ${latest.record.path}\n`);
        return 0;
    }
    if (args[0] === "monitor") {
        const runId = args[1]; const sessionId = args[2];
        if (!runId || !sessionId) throw new Error("Background monitor requires run and session identifiers.");
        const services = runtime();
        await new BackgroundMonitor(services.state, services.remediation, services.workflows, services.memos).run(runId, sessionId);
        return 0;
    }
    if (args[0] === "activate") {
        const systemId = systemIdFor(args[1]);
        if (!systemId) throw new Error("Activation target must be playbook or bulletproof.");
        return launch(systemId);
    }
    if (args.length > 0) throw new Error(`Unknown PBOS command: ${args.join(" ")}`);
    return launch();
}
