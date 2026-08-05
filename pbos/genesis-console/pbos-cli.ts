import { execFile } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { promisify } from "util";
import { BuildAuthorityService } from "../autonomous-authority";
import { GenesisStateRepository, OperatorIdentityService, PersistentAuthorityLedger, PersistentBuildGrantRegistry } from "../genesis-state";
import { GitHubRepositoryGateway } from "../platform";
import { REFERENCE_SYSTEMS } from "./system-definition";
import { GenesisControlPlane } from "./genesis-control-plane";
import { GenesisSystemCatalog } from "./system-catalog";
import { GenesisTerminal, SessionAuthorityProvider } from "./genesis-terminal";
import { GenesisWorkflowService } from "./genesis-workflow-service";
import { NodeTerminalIO } from "./terminal-io";
import { SystemIntakeTerminal } from "./system-intake-terminal";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { createDefaultRemediationHandler, GitHubCheckCollector, RemediationRun, ResumableRemediationEngine } from "../validation-automation";
import { NodeCommandRunner } from "../platform";
import { AutonomousBatchService, BackgroundMonitor, BackgroundProcessLauncher, OperatorContinuityService, OperatorMemoService } from "../operator-continuity";
import { ProductionRuntimeService } from "../production-runtime";
import { GovernedMissionQueue, ProductionMissionRunner } from "../production-runtime";
import { startMissionControl } from "../mission-control";
import { repositoryGapAnalysisExecutor } from "../application-readiness";

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
    return latestRunsBySystem(runs).filter(run => !["READY_FOR_CERTIFICATION", "BLOCKED"].includes(run.state));
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

async function runNextProductionMission(target?: string): Promise<number> {
    const services = runtime();
    const requestedSystemId = systemIdFor(target);
    if (target && !requestedSystemId) throw new Error("Production run target must be playbook or bulletproof.");
    const candidates = requestedSystemId ? services.state.missionQueue(requestedSystemId) : services.state.missionQueue();
    const next = new GovernedMissionQueue().next(candidates);
    if (!next) throw new Error("No eligible production mission. Run the application readiness review first.");
    const system = services.state.systems().find(item => item.systemId === next.systemId);
    if (!system) throw new Error(`Registered system not found for mission ${next.missionId}.`);
    const [owner, name] = system.repository.split("/");
    if (!owner || !name) throw new Error(`Invalid repository identity: ${system.repository}`);
    const repository = { owner, name, defaultBranch: system.defaultBranch };
    stdout.write(`[DISCOVERY] Resolving ${system.repository} at its governed revision…\n`);
    const inspection = await services.gateway.inspectRepository(repository);
    const approval = services.identities.approve(services.operator, "START_PRODUCTION_RUN", next.missionId, 30);
    if (!services.identities.verify(approval, "START_PRODUCTION_RUN", next.missionId)) {
        throw new Error("Production-run approval verification failed.");
    }
    services.state.appendAudit({ eventId: approval.approvalId, type: "VERIFIABLE_APPROVAL",
        actorId: services.operator.operatorId, resource: next.missionId, occurredAt: approval.issuedAt, evidence: { approval } });
    stdout.write(`[AUTHORIZED] ${next.title}\n`);
    const runner = new ProductionMissionRunner(services.state, services.production,
        (stage, message) => stdout.write(`[${stage}] ${message}\n`));
    const sequence = await runner.run({ systemId: next.systemId, actorId: services.operator.operatorId,
        authorizationArtifactId: approval.approvalId, repository: system.repository, branch: system.defaultBranch,
        commit: inspection.revision, approvedMissionIds: [next.missionId], autonomousContinuation: true,
        triggerSource: "CLI" }, mission => mission.missionId === "048-repository-gap-analysis"
        ? repositoryGapAnalysisExecutor(services.gateway, repository, inspection) : undefined);
    sequence.runs.forEach(run => stdout.write(`[RESULT] ${run.runId} — ${run.status} — ${run.durationMs ?? 0}ms\n`));
    stdout.write(`AUTONOMOUS STOP: ${sequence.stopReason}\n`);
    if (sequence.nextMission) {
        stdout.write(`NEXT MISSION: ${sequence.nextMission.title}\n`);
        stdout.write(`WHY: ${sequence.nextMission.rationale}\n`);
        stdout.write(`HUMAN APPROVAL REQUIRED: ${sequence.nextMission.approvalRequired ? "YES" : "NO"}\n`);
    }
    return sequence.stopReason === "NO_EXECUTION_ADAPTER" ? 1 : 0;
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
            stdout.write(`Validation: ${run.systemId} — PR #${run.pullRequest.number} — ${run.state}\n`);
            const job = state.backgroundJobForRun(run.runId);
            if (job) stdout.write(`Monitor: ${run.systemId} — ${job.status} — PID ${job.pid}\n`);
            const batch = [...state.autonomousBatches()].reverse().find(item => item.runId === run.runId);
            if (batch) stdout.write(`Batch: ${batch.systemId} — ${batch.state} — ${batch.workPackages.length}/${batch.packageLimit} packages\n`);
        });
        return 0;
    }
    if (args[0] === "health") {
        profile();
        const production = new ProductionRuntimeService(new GenesisStateRepository(genesisPath));
        const health = production.health();
        stdout.write(`${JSON.stringify(health, null, 2)}\n`); return health.health === "UNHEALTHY" ? 1 : 0;
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
        profile(); const production = new ProductionRuntimeService(new GenesisStateRepository(genesisPath));
        const next = production.snapshot().nextMission;
        stdout.write(next ? `${next.missionId} — ${next.title}\nReason: ${next.rationale}\nApproval required: ${next.approvalRequired ? "YES" : "NO"}\n` : "No eligible mission.\n"); return 0;
    }
    if (args[0] === "run") return runNextProductionMission(args[1]);
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
