import { AuthorityMode } from "../autonomous-authority";
import { GenesisControlPlane } from "./genesis-control-plane";
import { TerminalIO } from "./terminal-io";
import { SystemIntakeTerminal } from "./system-intake-terminal";
import { GenesisWorkflowService } from "./genesis-workflow-service";
import { ResumableRemediationEngine } from "../validation-automation";
import { AutonomousBatchService, OperatorContinuityService } from "../operator-continuity";

export interface SessionAuthorityProvider {
    authorize(systemId: string): Promise<{ operatorId: string; approvalId: string }>;
}

const MODES: readonly { mode: AuthorityMode; label: string }[] = [
    { mode: "READ_ONLY", label: "Read Only" },
    { mode: "HUMAN_GATED", label: "Human-Gated Build" },
    { mode: "DELEGATED_AUTONOMY", label: "Delegated Autonomous Build" }
];

export class GenesisTerminal {
    constructor(
        private readonly controlPlane: GenesisControlPlane,
        private readonly io: TerminalIO,
        private readonly intake = new SystemIntakeTerminal(),
        private readonly sessionAuthority?: SessionAuthorityProvider,
        private readonly workflows?: GenesisWorkflowService,
        private readonly remediation?: ResumableRemediationEngine,
        private readonly continuity?: OperatorContinuityService,
        private readonly batches?: AutonomousBatchService
    ) {}

    async run(preselectedSystemId?: string): Promise<number> {
        try {
            this.io.write("PBOS GENESIS");
            this.io.write("System Factory Console\n");
            if (!preselectedSystemId) {
                this.io.write("1. Build or continue an existing application");
                this.io.write("   Choose The Playbook or Bulletproof Beneficiary");
                this.io.write("2. Create and register a new operating system");
                const operation = this.selection(await this.io.prompt("\nChoose an operation: "), 2);
                if (operation === 1) {
                    await this.intake.collect(this.io);
                    return 0;
                }
            } else {
                this.io.write("DIRECT APPLICATION BUILD");
                this.io.write(`Preselected system: ${preselectedSystemId}`);
                this.io.write("The application-selection step has been skipped by the command shortcut.\n");
            }
            const systems = this.controlPlane.listSystems();
            const system = preselectedSystemId ? systems.find(candidate => candidate.systemId === preselectedSystemId) : undefined;
            if (preselectedSystemId && !system) throw new Error(`Registered system not found: ${preselectedSystemId}`);
            if (preselectedSystemId && system) {
                this.io.write(`Selected application: ${system.name}`);
                this.io.write(`${system.systemId} | ${system.domain} | ${system.status}`);
            }
            if (!preselectedSystemId) {
                this.io.write("\nSELECT THE APPLICATION TO BUILD");
                systems.forEach((candidate, index) => {
                    this.io.write(`${index + 1}. ${candidate.name}`);
                    this.io.write(`   ${candidate.systemId} | ${candidate.domain} | ${candidate.status}`);
                });
            }
            const selectedSystem = system ?? systems[this.selection(await this.io.prompt("\nSelect an application: "), systems.length)];
            if (!selectedSystem) throw new Error("No registered application was selected.");

            this.io.write("\nSelect authority mode:");
            MODES.forEach((entry, index) => this.io.write(`${index + 1}. ${entry.label}`));
            const modeIndex = this.selection(await this.io.prompt("\nAuthority mode: "), MODES.length);
            const selectedMode = MODES[modeIndex];

            this.io.write("");
            this.io.write(`System: ${selectedSystem.name}`);
            this.io.write(`Repository: ${selectedSystem.repository}`);
            this.io.write(`Authority: ${selectedMode.label}`);
            this.io.write(`Batch scope: ${selectedMode.mode === "DELEGATED_AUTONOMY" ? "selected after repository planning (maximum 10)" : "1 work package"}`);
            this.io.write("Branch scope: agent/*");
            this.io.write("Protected: staging deploy, merge, production deploy, destructive migration, secrets, certification, cross-repository work");
            const confirmed = (await this.io.prompt("\nAuthorize this build session? [y/N] ")).trim().toLowerCase();
            if (confirmed !== "y" && confirmed !== "yes") {
                this.io.write("Build session not authorized.");
                return 1;
            }
            const identity = this.sessionAuthority
                ? await this.sessionAuthority.authorize(selectedSystem.systemId)
                : { operatorId: "GENESIS-TERMINAL-OPERATOR", approvalId: `terminal-approval-${Date.now()}` };
            const session = this.controlPlane.activateSystem(
                selectedSystem.systemId,
                selectedMode.mode,
                identity.operatorId,
                identity.approvalId
            );
            this.io.write("");
            this.io.write("Build session active.");
            this.io.write(`Session: ${session.sessionId}`);
            this.io.write(`Grant: ${session.grant.grantId}`);
            this.io.write(`Expires: ${session.grant.expiresAt.toISOString()}`);
            this.io.write("Available: inspect, status, plan, propose, build, test preparation, documentation, commit, push, draft PR");
            const workflowOutcome = this.workflows
                ? selectedMode.mode === "DELEGATED_AUTONOMY" ? await this.runDelegatedWorkflow(session) : await this.runWorkflow(session, 1)
                : false;
            const readinessReviewComplete = workflowOutcome === "READINESS_REVIEW";
            const backgroundStarted = workflowOutcome === true;
            if (this.continuity && !readinessReviewComplete) {
                const summary = this.continuity.summarize(session);
                this.io.write("");
                summary.lines.forEach(line => this.io.write(line));
                if (!backgroundStarted && summary.run && !["READY_FOR_CERTIFICATION", "BLOCKED"].includes(summary.run.state)) {
                    const background = (await this.io.prompt("Continue validation monitoring in background? [y/N] ")).trim().toLowerCase();
                    if (background === "y" || background === "yes") {
                        const job = this.continuity.launchBackground(session);
                        if (job) {
                            this.io.write(`Background monitor started: PID ${job.pid}`);
                            this.io.write(`Monitor log: ${job.logPath}`);
                            this.io.write("Use `pbos memo` for the latest operator briefing.");
                        }
                    }
                }
            }
            return 0;
        } catch (error) {
            this.io.write(`Genesis console error: ${error instanceof Error ? error.message : String(error)}`);
            return 1;
        } finally {
            this.io.close();
        }
    }

    private async runWorkflow(session: import("./genesis-control-plane").GenesisBuildSession, packageLimit: number): Promise<boolean> {
        while (true) {
            this.io.write("");
            this.io.write("1. Inspect repository and create build plan");
            this.io.write("2. Prepare application build on agent branch and open draft PR");
            this.io.write("3. Collect validation evidence and resume remediation");
            this.io.write("4. Exit");
            const answer = (await this.io.prompt("Next action [4]: ")).trim();
            if (!answer || answer === "4") return false;
            if (answer === "1") {
                const plan = await this.workflows!.inspectAndPlan(session);
                this.io.write(`Plan: ${plan.planId}`);
                this.io.write(`Status: ${plan.status}`);
                this.io.write(`Work packages: ${plan.workPackages.length}`);
                this.io.write("Next recommended action: prepare the application build.");
                continue;
            }
            if (answer === "2") {
                const build = await this.workflows!.prepareDraftBuild(session, packageLimit);
                this.io.write(`Branch: ${build.branch}`);
                this.io.write(`Draft PR: ${build.pullRequest.url}`);
                const remediation = this.remediation?.start(session.system.systemId, build.pullRequest);
                if (remediation) this.io.write(`Validation run: ${remediation.runId}`);
                if (remediation && this.batches) {
                    const batch = this.batches.start(session, build.plan, packageLimit, build.pullRequest, remediation.runId, build.batchId, build.revision, build.generatedPaths);
                    this.io.write(`Batch: ${batch.batchId}`);
                    this.io.write(`Work packages queued: ${batch.workPackages.length}/${batch.packageLimit}`);
                }
                this.io.write("GitHub Actions will validate automatically.");
                if (session.grant.mode === "DELEGATED_AUTONOMY" && remediation && this.continuity) {
                    const job = this.continuity.launchBackground(session);
                    if (job) {
                        this.io.write(`Autonomous monitoring started: PID ${job.pid}`);
                        this.io.write("PBOS will monitor, remediate when deterministic, update the memo, and notify you when the batch is ready or blocked.");
                        this.io.write(`Watch live: npm run pbos:watch -- ${session.system.systemId}`);
                        return true;
                    }
                }
                this.io.write("Next recommended action: exit and allow PBOS monitoring to continue.");
                continue;
            }
            if (answer === "3") {
                if (!this.remediation) throw new Error("Validation automation is not configured.");
                let current = this.remediation.latest(session.system.systemId);
                if (!current) {
                    const value = (await this.io.prompt("Existing draft PR number [1]: ")).trim() || "1";
                    const number = Number.parseInt(value, 10);
                    if (!Number.isInteger(number) || number <= 0) throw new Error("Invalid pull request number.");
                    const branch = `agent/pbos-${session.system.systemId.toLowerCase()}-vertical-slice`;
                    current = this.remediation.start(session.system.systemId, {
                        number, branch, repository: session.system.repository,
                        url: `https://github.com/${session.system.repository}/pull/${number}`
                    });
                    this.io.write(`Adopted validation run: ${current.runId}`);
                }
                const resumed = await this.remediation.resume(current.runId, run => this.workflows!.authorizeRemediation(session, run.pullRequest.branch));
                this.io.write(`Validation state: ${resumed.state}`);
                this.io.write(`Attempt: ${resumed.attempt}/${resumed.maximumAttempts}`);
                resumed.evidence.forEach(item => this.io.write(`${item.name}: ${item.state}`));
                if (resumed.state === "READY_FOR_CERTIFICATION") this.io.write("Certification memo is ready for human approval.");
                if (resumed.state === "REMEDIATION_PUSHED") this.io.write(`Remediation pushed: ${resumed.remediationRevision}`);
                if (["WAITING_FOR_CHECKS", "WAITING_FOR_INFRASTRUCTURE", "REMEDIATION_PUSHED"].includes(resumed.state)) {
                    this.io.write("Validation is still running. PBOS monitoring will collect the next update automatically.");
                }
                resumed.blockers.forEach(blocker => this.io.write(`Blocked: ${blocker}`));
                continue;
            }
            throw new Error("Invalid workflow selection.");
        }
    }

    private async runDelegatedWorkflow(session: import("./genesis-control-plane").GenesisBuildSession): Promise<boolean | "READINESS_REVIEW"> {
        const existingBatch = this.batches?.latest(session.system.systemId);
        let preparedPlan: Awaited<ReturnType<GenesisWorkflowService["inspectAndPlan"]>> | undefined;
        const legacyRun = this.remediation?.latest(session.system.systemId);
        if (!existingBatch && legacyRun && !["READY_FOR_CERTIFICATION", "BLOCKED"].includes(legacyRun.state)) {
            this.io.write("");
            this.io.write("EXISTING PRE-BATCH VALIDATION DETECTED");
            this.io.write(`State: ${legacyRun.state}`);
            this.io.write(`Pull request: ${legacyRun.pullRequest.url}`);
            this.io.write("PBOS will monitor this earlier PR without guessing which packages it completes or opening a duplicate.");
            const job = this.continuity?.launchBackground(session);
            if (job) this.io.write(`Monitoring: PID ${job.pid} — ${job.logPath}`);
            return Boolean(job);
        }
        if (!existingBatch && legacyRun?.state === "BLOCKED") {
            this.io.write(`Existing pre-batch validation is blocked and requires human review: ${legacyRun.pullRequest.url}`);
            return false;
        }
        if (!existingBatch && legacyRun?.state === "READY_FOR_CERTIFICATION") {
            preparedPlan = await this.workflows!.inspectAndPlan(session);
            const mergedEvidence = preparedPlan.inspection.findings.some(finding =>
                finding.startsWith("CAPABILITY:") && finding.endsWith(":PRESENT"));
            if (!mergedEvidence) {
                this.io.write("EXISTING PRE-BATCH PR IS GREEN AND AWAITING HUMAN CERTIFICATION/MERGE");
                this.io.write(`Pull request: ${legacyRun.pullRequest.url}`);
                this.io.write("PBOS will not infer completion until its evidence appears on the governed default branch.");
                return false;
            }
            this.io.write("Merged capability evidence from the pre-batch PR is present on the governed default branch.");
        }
        if (existingBatch && ["PLANNED", "VALIDATING", "WAITING_FOR_INFRASTRUCTURE", "REMEDIATING"].includes(existingBatch.state)) {
            this.io.write("");
            this.io.write("EXISTING AUTONOMOUS BATCH DETECTED");
            this.io.write(`Batch: ${existingBatch.batchId}`);
            this.io.write(`State: ${existingBatch.state}`);
            this.io.write(`Pull request: ${existingBatch.pullRequestUrl}`);
            this.io.write("PBOS will not create a duplicate batch while this package set remains active.");
            const job = this.continuity?.launchBackground(session);
            if (job) this.io.write(`Monitoring: PID ${job.pid} — ${job.logPath}`);
            if (job && this.batches) await this.streamBatchTelemetry(session.system.systemId, existingBatch.batchId);
            else this.io.write(`Watch live: npm run pbos:watch -- ${session.system.systemId}`);
            return Boolean(job);
        }
        if (existingBatch?.state === "BLOCKED") {
            this.io.write(`Build blocked: batch ${existingBatch.batchId} requires human remediation before another batch can start.`);
            this.io.write(`Review: ${existingBatch.pullRequestUrl}`);
            return false;
        }
        if (existingBatch?.state === "READY_FOR_CERTIFICATION") {
            preparedPlan = await this.workflows!.inspectAndPlan(session);
            const remainingIds = new Set(preparedPlan.workPackages.map(item => item.id));
            const awaitingMerge = existingBatch.workPackages.filter(item => remainingIds.has(item.workPackageId));
            if (awaitingMerge.length) {
                this.io.write("PRIOR BATCH IS GREEN AND AWAITING HUMAN CERTIFICATION/MERGE");
                this.io.write(`Pull request: ${existingBatch.pullRequestUrl}`);
                this.io.write(`Packages awaiting merge evidence: ${awaitingMerge.length}`);
                this.io.write("NEXT HUMAN STEP: certify and merge the prior batch. PBOS will recognize it from the governed default branch on the next launch.");
                return false;
            }
            // Older adapters and focused test doubles predate the production-runtime
            // certification hook. Governed repository evidence remains authoritative;
            // invoke the durable lifecycle transition when the adapter supports it.
            this.batches?.certify?.(existingBatch.batchId, `governed-merge:${preparedPlan.repositoryRevision}`);
            this.io.write(`Prior batch ${existingBatch.batchId} is now proven on the governed default branch. Continuing to the next incomplete packages.`);
        }
        this.io.write("");
        this.io.write("AUTONOMOUS BATCH PLANNING");
        const plan = preparedPlan ?? await this.workflows!.inspectAndPlan(session);
        if (plan.status !== "READY_FOR_APPROVAL") throw new Error(`Build plan blocked: ${plan.blockers.join("; ")}`);
        const completed = plan.blueprint.capabilities.filter(capability =>
            plan.inspection.findings.includes(`CAPABILITY:${capability}:PRESENT`));
        if (completed.length) {
            this.io.write("Already completed on the governed default branch:");
            completed.forEach(capability => this.io.write(`✓ ${capability}`));
        }
        const available = Math.min(plan.workPackages.length, 10);
        if (available === 0) {
            // Capability inspection is not sufficient authority to construct the
            // Playbook product queue. The normal PBOS run path compiles the full
            // exact-revision canonical graph before selecting a mission.
            this.io.write("No incomplete capability work packages were discovered.");
            this.io.write("");
            this.io.write("APPLICATION READINESS REVIEW");
            this.io.write(`Repository: ${session.system.repository}`);
            this.io.write(`Governed revision: ${plan.repositoryRevision}`);
            this.io.write(`Capability foundation: ${completed.length}/${plan.blueprint.capabilities.length} complete`);
            this.io.write("Required delivery surfaces: WEB, IOS, ANDROID");
            this.io.write("Readiness streams:");
            this.io.write("1. CIP-048 — Web journeys, durable data, authority, responsive UX, accessibility, and staging");
            this.io.write("2. CIP-049 — Shared mobile foundation, native journeys, store preparation, and release certification");
            this.io.write("3. CIP-050 — Independent multi-platform evidence and ecosystem certification");
            this.io.write("Readiness state: READY_FOR_GAP_ANALYSIS");
            this.io.write("NEXT MISSION: Compile the complete exact-revision Playbook canonical graph");
            this.io.write("SELECTION REASON: Capability evidence cannot substitute for the 17-OS and role-onboarding product authority graph.");
            this.io.write("APPROVAL REQUIRED: NO");
            this.io.write("Historical PR certification is complete and is not current session work.");
            return "READINESS_REVIEW";
        }
        this.io.write(`${plan.workPackages.length} incomplete work package${plan.workPackages.length === 1 ? "" : "s"} discovered.`);
        plan.workPackages.slice(0, 10).forEach((item, index) => this.io.write(`${index + 1}. ${item.title}`));
        const choices = [...new Set([1, Math.min(5, available), available])].sort((left, right) => left - right);
        const allRemainingFit = plan.workPackages.length <= 10;
        this.io.write("\nSelect the next governed batch:");
        choices.forEach((count, index) => {
            const scope = count === available
                ? allRemainingFit ? `all ${available} remaining` : `the next ${available} of ${plan.workPackages.length} remaining`
                : `the next ${count}`;
            this.io.write(`${index + 1}. Build ${scope} work package${count === 1 ? "" : "s"}${count === available ? " (Recommended)" : ""}`);
        });
        const raw = (await this.io.prompt(`Batch selection [${choices.length}]: `)).trim();
        const choice = raw ? this.selection(raw, choices.length) : choices.length - 1;
        const packageLimit = choices[choice];
        const selected = plan.workPackages.slice(0, packageLimit);
        this.io.write("");
        this.io.write(`Selected batch: ${selected.length} work package${selected.length === 1 ? "" : "s"}`);
        selected.forEach((item, index) => this.io.write(`  ${index + 1}. ${item.title}`));
        const remainingAfterBatch = Math.max(0, plan.workPackages.length - selected.length);
        this.io.write(`Remaining after this batch: ${remainingAfterBatch} work package${remainingAfterBatch === 1 ? "" : "s"}`);
        this.io.write("PBOS will build this batch, open one draft PR, monitor validation, remediate deterministic failures, and notify you when human approval is required.");
        const confirmed = (await this.io.prompt("Start this autonomous batch now? [Y/n] ")).trim().toLowerCase();
        if (confirmed === "n" || confirmed === "no") {
            this.io.write("Autonomous batch not started.");
            return false;
        }
        const build = await this.workflows!.prepareDraftBuild(session, packageLimit, plan);
        this.io.write(`Branch: ${build.branch}`);
        this.io.write(`Draft PR: ${build.pullRequest.url}`);
        if (!this.remediation) throw new Error("Validation automation is not configured.");
        const remediation = this.remediation.start(session.system.systemId, build.pullRequest);
        this.io.write(`Validation run: ${remediation.runId}`);
        let activeBatchId: string | undefined;
        if (this.batches) {
            const batch = this.batches.start(session, build.plan, packageLimit, build.pullRequest, remediation.runId, build.batchId, build.revision, build.generatedPaths);
            activeBatchId = batch.batchId;
            this.io.write(`Batch: ${batch.batchId}`);
            this.io.write(`Work packages queued: ${batch.workPackages.length}/${batch.packageLimit}`);
        }
        if (!this.continuity) throw new Error("Operator continuity is not configured.");
        const job = this.continuity.launchBackground(session);
        if (!job) throw new Error("Autonomous validation monitor could not be started.");
        this.io.write(`Autonomous monitoring started: PID ${job.pid}`);
        this.io.write(`Monitor log: ${job.logPath}`);
        if (activeBatchId && this.batches) {
            await this.streamBatchTelemetry(session.system.systemId, activeBatchId);
            this.io.write("NEXT HUMAN STEP: Review the certification memo and approve or reject the completed batch.");
        } else {
            this.io.write(`Watch live: npm run pbos:watch -- ${session.system.systemId}`);
            this.io.write("NEXT HUMAN STEP: Wait for the PBOS notification, then review the certification memo. No repeated terminal selections are required.");
        }
        return true;
    }

    private async streamBatchTelemetry(systemId: string, batchId: string): Promise<void> {
        if (!this.batches) return;
        this.io.write("");
        this.io.write("LIVE BUILD TELEMETRY");
        this.io.write("This terminal is attached to the autonomous build. Press Ctrl-C to detach; background execution will continue.");
        const seen = new Set<string>();
        const seenProductionEvents = new Set<string>();
        let priorState = "";
        for (;;) {
            const batch = this.batches.latest(systemId);
            if (!batch || batch.batchId !== batchId) throw new Error(`Active telemetry batch not found: ${batchId}`);
            for (const event of this.batches.telemetry(batchId)) {
                if (seen.has(event.eventId)) continue;
                seen.add(event.eventId);
                const scope = event.workPackageId ? ` [${event.workPackageId}]` : "";
                this.io.write(`${event.occurredAt} ${event.type}${scope}: ${event.title}`);
                this.io.write(`  ${event.detail}`);
            }
            for (const event of this.batches.productionTelemetry?.(batchId) ?? []) {
                if (seenProductionEvents.has(event.eventId)) continue;
                seenProductionEvents.add(event.eventId);
                this.io.write(`${event.timestamp} ${event.type}: ${event.summary}`);
            }
            this.batches.heartbeat?.(batchId);
            const production = this.batches.productionState?.(batchId);
            if (production?.run) {
                const elapsed = Math.max(0, Date.now() - Date.parse(production.run.startedAt));
                this.io.write(`ACTIVE: ${production.run.status} · ${production.stage?.title ?? "transitioning"} · elapsed ${this.humanDuration(elapsed)} · heartbeat ${production.run.lastHeartbeatAt}`);
            }
            if (batch.state !== priorState) {
                this.io.write(`BATCH STATE: ${batch.state}`);
                priorState = batch.state;
            }
            if (["READY_FOR_CERTIFICATION", "BLOCKED"].includes(batch.state)) {
                this.io.write(batch.state === "READY_FOR_CERTIFICATION"
                    ? "TELEMETRY COMPLETE: the entire batch is ready for human certification."
                    : "TELEMETRY STOPPED: the batch requires human intervention.");
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 5_000));
        }
    }

    private humanDuration(milliseconds: number): string {
        const seconds = Math.floor(milliseconds / 1_000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ${seconds % 60}s`;
    }

    private selection(value: string, count: number): number {
        const selected = Number.parseInt(value.trim(), 10) - 1;
        if (!Number.isInteger(selected) || selected < 0 || selected >= count) {
            throw new Error("Invalid terminal selection.");
        }
        return selected;
    }
}
