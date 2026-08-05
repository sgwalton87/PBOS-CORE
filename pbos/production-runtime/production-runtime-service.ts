import { hostname } from "os";
import { randomUUID } from "crypto";
import { GenesisStateRepository } from "../genesis-state";
import { ExecutionLease, MissionControlSnapshot, MissionQueueItem, PreviewManifest, ProductionEvent, ProductionExecutionPlan, ProductionRun,
    ProductionStage, ProductionStatus, RuntimeHealthReport, RuntimeMetrics, StageType } from "./contracts";
import { assertProductionTransition, isTerminalProductionStatus } from "./status-machine";
import { GovernedMissionQueue } from "./mission-queue";

export interface BeginProductionRun {
    readonly runId?: string;
    readonly systemId: string;
    readonly actorId: string;
    readonly authorizationArtifactId: string;
    readonly repository: string;
    readonly branch: string;
    readonly commit: string;
    readonly objective: string;
    readonly mission: string;
    readonly rationale: string;
    readonly dependencies?: readonly string[];
    readonly parentRunId?: string;
    readonly triggerSource?: ProductionRun["triggerSource"];
    readonly autonomousContinuation?: boolean;
    readonly runType?: ProductionRun["runType"];
}

const ACTIVE: readonly ProductionStatus[] = ["PLANNING", "AUTHORIZED", "QUEUED", "STARTING", "RUNNING", "VALIDATING", "REPAIRING", "GENERATING_PREVIEW", "AWAITING_APPROVAL", "PAUSED", "RECOVERING"];
const LEASE_REQUIRED: readonly ProductionStatus[] = ["AUTHORIZED", "QUEUED", "STARTING", "RUNNING", "VALIDATING", "REPAIRING", "GENERATING_PREVIEW", "RECOVERING"];

export class ProductionRuntimeService {
    constructor(private readonly state: GenesisStateRepository, private readonly leaseTtlMs = 30_000,
        private readonly now: () => Date = () => new Date()) {}

    begin(input: BeginProductionRun): ProductionRun {
        if (!input.authorizationArtifactId.trim()) throw new Error("Production execution requires a verifiable authorization artifact.");
        const active = this.activeRun(input.repository);
        if (active) throw new Error(`Production execution already owned by run ${active.runId}.`);
        const timestamp = this.now().toISOString();
        const runId = input.runId ?? randomUUID();
        const run: ProductionRun = {
            runId, runType: input.runType ?? "AUTONOMOUS_BUILD", triggerSource: input.triggerSource ?? "CLI", actorId: input.actorId,
            authorizationArtifactId: input.authorizationArtifactId, parentRunId: input.parentRunId,
            repositoryContextId: `repository:${input.repository}:${input.commit}`,
            runtimeContextId: `runtime:${runId}`, systemId: input.systemId, repository: input.repository,
            startingBranch: input.branch, startingCommit: input.commit, currentBranch: input.branch, currentCommit: input.commit,
            requestedObjective: input.objective, selectedMission: input.mission, selectionRationale: input.rationale,
            dependencySnapshot: input.dependencies ?? [], status: "AUTHORIZED", startedAt: timestamp, lastHeartbeatAt: timestamp,
            stageIds: [], retryCount: 0, repairAttempts: 0, filesAdded: [], filesModified: [], filesDeleted: [],
            commandsExecuted: [], testsExecuted: [], validationResults: [], previewArtifactIds: [], evidenceIds: [], blockers: [],
            autonomousContinuation: input.autonomousContinuation ?? true
        };
        this.state.saveProductionRun(run);
        this.event(run, "RUN_REQUESTED", "Production run requested and authorized.", { objective: input.objective });
        this.acquireLease(run);
        return run;
    }

    transition(runId: string, status: ProductionStatus, summary: string, payload: Readonly<Record<string, unknown>> = {}): ProductionRun {
        const current = this.requireRun(runId);
        assertProductionTransition(current.status, status);
        const timestamp = this.now().toISOString();
        const terminal = isTerminalProductionStatus(status);
        const updated: ProductionRun = { ...current, status, lastHeartbeatAt: timestamp,
            completedAt: terminal ? timestamp : current.completedAt,
            durationMs: terminal ? Math.max(0, this.now().getTime() - Date.parse(current.startedAt)) : current.durationMs,
            terminalSummary: terminal ? summary : current.terminalSummary };
        this.state.saveProductionRun(updated);
        this.event(updated, `RUN_${status}`, summary, payload, status === "FAILED" ? "ERROR" : status === "BLOCKED" ? "WARN" : "INFO");
        if (terminal) this.releaseLease(runId, status === "CANCELLED" ? "CANCELLED" : "COMPLETED");
        else if (status === "PAUSED" || status === "AWAITING_APPROVAL") this.releaseLease(runId, status);
        return updated;
    }

    heartbeat(runId: string): ProductionRun {
        const run = this.requireRun(runId); const timestamp = this.now().toISOString();
        const updated = { ...run, lastHeartbeatAt: timestamp };
        this.state.saveProductionRun(updated);
        const lease = this.activeLease(runId);
        if (lease) this.state.saveExecutionLease({ ...lease, lastRenewedAt: timestamp,
            expiresAt: new Date(this.now().getTime() + this.leaseTtlMs).toISOString() });
        return updated;
    }

    startStage(runId: string, type: StageType, title: string, inputs: Readonly<Record<string, unknown>> = {}, command?: string): ProductionStage {
        const run = this.heartbeat(runId); const timestamp = this.now().toISOString();
        const stage: ProductionStage = { stageId: randomUUID(), runId, type, title, status: "RUNNING", startedAt: timestamp,
            lastHeartbeatAt: timestamp, attempt: 1, inputs, outputs: {}, command: command ? this.redact(command) : undefined,
            logs: [], evidenceIds: [] };
        this.state.saveProductionStage(stage);
        this.state.saveProductionRun({ ...run, activeStageId: stage.stageId, stageIds: [...run.stageIds, stage.stageId] });
        this.event(run, "STAGE_STARTED", `${title} started.`, { stageId: stage.stageId, type }, "INFO", stage.stageId);
        return stage;
    }

    completeStage(stageId: string, outputs: Readonly<Record<string, unknown>> = {}, evidenceIds: readonly string[] = []): ProductionStage {
        const stage = this.state.productionStages().find(item => item.stageId === stageId);
        if (!stage) throw new Error(`Production stage not found: ${stageId}`);
        const timestamp = this.now().toISOString();
        const updated: ProductionStage = { ...stage, status: "COMPLETED", completedAt: timestamp,
            lastHeartbeatAt: timestamp, durationMs: Math.max(0, this.now().getTime() - Date.parse(stage.startedAt)), outputs, evidenceIds };
        this.state.saveProductionStage(updated);
        const run = this.requireRun(stage.runId);
        this.state.saveProductionRun({ ...run, activeStageId: undefined, lastHeartbeatAt: timestamp,
            evidenceIds: [...new Set([...run.evidenceIds, ...evidenceIds])] });
        this.event(run, "STAGE_COMPLETED", `${stage.title} completed.`, { stageId, durationMs: updated.durationMs }, "INFO", stageId);
        return updated;
    }

    completeActiveStage(runId: string, outputs: Readonly<Record<string, unknown>> = {}, evidenceIds: readonly string[] = []): ProductionStage | undefined {
        const run = this.requireRun(runId);
        return run.activeStageId ? this.completeStage(run.activeStageId, outputs, evidenceIds) : undefined;
    }

    failStage(stageId: string, error: string): ProductionStage {
        const stage = this.state.productionStages().find(item => item.stageId === stageId);
        if (!stage) throw new Error(`Production stage not found: ${stageId}`);
        const timestamp = this.now().toISOString();
        const updated: ProductionStage = { ...stage, status: "FAILED", completedAt: timestamp, lastHeartbeatAt: timestamp,
            durationMs: Math.max(0, this.now().getTime() - Date.parse(stage.startedAt)), error: this.redact(error) };
        this.state.saveProductionStage(updated);
        this.event(this.requireRun(stage.runId), "STAGE_FAILED", `${stage.title} failed.`, { stageId, error: updated.error }, "ERROR", stageId);
        return updated;
    }

    recordPreview(manifest: PreviewManifest): void {
        if (manifest.runId !== this.requireRun(manifest.runId).runId) throw new Error("Preview lineage is invalid.");
        this.state.savePreviewManifest(manifest);
        const run = this.requireRun(manifest.runId);
        this.state.saveProductionRun({ ...run, previewArtifactIds: [...new Set([...run.previewArtifactIds, manifest.previewId])] });
        this.event(run, manifest.status === "READY" ? "PREVIEW_READY" : "PREVIEW_RECORDED", `Preview ${manifest.status.toLowerCase()}.`, { previewId: manifest.previewId });
    }

    recordCommand(runId: string, command: string, exitCode: number, durationMs: number, output = ""): ProductionRun {
        if (!Number.isInteger(exitCode) || !Number.isFinite(durationMs) || durationMs < 0) throw new Error("Command evidence is invalid.");
        const run = this.heartbeat(runId); const safeCommand = this.redact(command); const safeOutput = this.redact(output).slice(-20_000);
        const updated = { ...run, commandsExecuted: [...run.commandsExecuted, safeCommand] };
        this.state.saveProductionRun(updated);
        this.event(updated, "COMMAND_COMPLETED", `${safeCommand} exited ${exitCode}.`, { command: safeCommand, exitCode, durationMs, output: safeOutput }, exitCode === 0 ? "INFO" : "ERROR");
        return updated;
    }

    recordFiles(runId: string, changes: Readonly<{ added?: readonly string[]; modified?: readonly string[]; deleted?: readonly string[] }>): ProductionRun {
        const run = this.heartbeat(runId);
        const updated = { ...run, filesAdded: [...new Set([...run.filesAdded, ...(changes.added ?? [])])],
            filesModified: [...new Set([...run.filesModified, ...(changes.modified ?? [])])],
            filesDeleted: [...new Set([...run.filesDeleted, ...(changes.deleted ?? [])])] };
        this.state.saveProductionRun(updated);
        this.event(updated, "FILES_CHANGED", "Repository change inventory recorded.", { added: changes.added ?? [], modified: changes.modified ?? [], deleted: changes.deleted ?? [] });
        return updated;
    }

    updateRepositoryPosition(runId: string, branch: string, commit: string): ProductionRun {
        if (!branch.trim() || !/^[a-f0-9]{7,40}$/i.test(commit)) throw new Error("Repository position requires an exact branch and commit.");
        const run = this.heartbeat(runId); const updated = { ...run, currentBranch: branch, currentCommit: commit };
        this.state.saveProductionRun(updated);
        this.event(updated, "REPOSITORY_POSITION_UPDATED", "Production run advanced to a governed repository revision.", { branch, commit });
        return updated;
    }

    recordValidation(runId: string, name: string, passed: boolean, durationMs: number, evidenceId: string): ProductionRun {
        if (!name.trim() || !evidenceId.trim() || durationMs < 0) throw new Error("Validation evidence is incomplete.");
        const run = this.heartbeat(runId);
        const result = `${name}:${passed ? "PASSED" : "FAILED"}:${durationMs}ms:${evidenceId}`;
        const updated = { ...run, validationResults: [...run.validationResults, result],
            testsExecuted: /test/i.test(name) ? [...run.testsExecuted, name] : run.testsExecuted,
            evidenceIds: [...new Set([...run.evidenceIds, evidenceId])] };
        this.state.saveProductionRun(updated);
        this.event(updated, passed ? "VALIDATION_PASSED" : "VALIDATION_FAILED", `${name} ${passed ? "passed" : "failed"}.`, { name, durationMs, evidenceId }, passed ? "INFO" : "ERROR");
        return updated;
    }

    recordRepairAttempt(runId: string, classification: string, outcome: "STARTED" | "SUCCEEDED" | "FAILED", maximumAttempts = 5): ProductionRun {
        const run = this.heartbeat(runId);
        const attempts = outcome === "STARTED" ? run.repairAttempts + 1 : run.repairAttempts;
        if (attempts > maximumAttempts) throw new Error(`Repair limit exceeded for run ${runId}.`);
        const updated = { ...run, repairAttempts: attempts };
        this.state.saveProductionRun(updated);
        this.event(updated, `REPAIR_${outcome}`, `Repair ${outcome.toLowerCase()}: ${classification}.`, { classification, attempt: attempts, maximumAttempts }, outcome === "FAILED" ? "ERROR" : "INFO");
        return updated;
    }

    recordExecutionPlan(runId: string, plan: ProductionExecutionPlan): ProductionRun {
        if (plan.runId !== runId || !plan.planId.trim() || !plan.missionId.trim()) {
            throw new Error("Execution plan lineage is invalid.");
        }
        const run = this.heartbeat(runId);
        const updated = { ...run, executionPlan: plan };
        this.state.saveProductionRun(updated);
        this.event(updated, "EXECUTION_PLAN_READY", "Machine-readable execution plan recorded.", {
            planId: plan.planId, missionId: plan.missionId, expectedArtifacts: plan.expectedArtifacts
        });
        return updated;
    }

    updateMissionStatus(systemId: string, missionId: string, status: MissionQueueItem["status"],
        evidenceIds: readonly string[] = []): MissionQueueItem {
        const items = this.state.missionQueue(systemId);
        const current = items.find(item => item.missionId === missionId);
        if (!current) throw new Error(`Mission not found: ${missionId}`);
        const updated = { ...current, status, evidenceIds: [...new Set([...current.evidenceIds, ...evidenceIds])] };
        this.reconcileQueue(systemId, items.map(item => item.missionId === missionId ? updated : item));
        return this.state.missionQueue(systemId).find(item => item.missionId === missionId)!;
    }

    reconcileQueue(systemId: string, items: readonly MissionQueueItem[]): readonly MissionQueueItem[] {
        const reconciled = new GovernedMissionQueue().reconcile(items);
        this.state.saveMissionQueue(reconciled, systemId);
        return reconciled;
    }

    activeRun(repository?: string): ProductionRun | undefined {
        return [...this.state.productionRuns()].reverse().find(run => ACTIVE.includes(run.status) && (!repository || run.repository === repository));
    }
    run(runId: string): ProductionRun | undefined { return this.state.productionRun(runId); }
    history(): readonly ProductionRun[] { return [...this.state.productionRuns()].reverse(); }
    events(runId?: string, afterSequence = 0): readonly ProductionEvent[] {
        return this.state.productionEvents(runId).filter(event => event.sequence > afterSequence);
    }

    pause(runId: string, actorId: string): ProductionRun {
        const run = this.requireActor(runId, actorId);
        if (!["RUNNING", "VALIDATING", "REPAIRING", "GENERATING_PREVIEW"].includes(run.status)) {
            throw new Error(`Run ${runId} cannot pause from ${run.status}.`);
        }
        return this.transition(runId, "PAUSED", "Run paused at a governed checkpoint.", { actorId });
    }

    resume(runId: string, actorId: string): ProductionRun {
        const run = this.requireActor(runId, actorId);
        if (!["PAUSED", "RECOVERING"].includes(run.status)) throw new Error(`Run ${runId} is not resumable from ${run.status}.`);
        if (!this.activeLease(runId)) this.acquireLease(run);
        return this.transition(runId, run.activeStageId ? "RUNNING" : "VALIDATING", "Authorized run resumed from its durable checkpoint.", { actorId });
    }

    cancel(runId: string, actorId: string): ProductionRun {
        const run = this.requireActor(runId, actorId);
        if (isTerminalProductionStatus(run.status)) throw new Error(`Run ${runId} is already terminal.`);
        return this.transition(runId, "CANCELLED", "Run cancelled by an authorized operator.", { actorId });
    }

    verifyIntegrity(): Readonly<{ valid: boolean; errors: readonly string[]; checkedAt: string }> {
        const errors: string[] = [];
        const events = this.state.productionEvents();
        events.forEach((event, index) => {
            if (index > 0 && event.sequence <= events[index - 1].sequence) errors.push(`Event sequence is not increasing at ${event.eventId}.`);
            if (!this.state.productionRun(event.runId)) errors.push(`Event ${event.eventId} references missing run ${event.runId}.`);
        });
        this.state.productionRuns().filter(run => LEASE_REQUIRED.includes(run.status)).forEach(run => {
            if (!this.activeLease(run.runId)) errors.push(`Active run ${run.runId} has no active execution lease.`);
        });
        return { valid: errors.length === 0, errors, checkedAt: this.now().toISOString() };
    }

    recoverStaleRuns(): readonly ProductionRun[] {
        const recovered: ProductionRun[] = [];
        for (const lease of this.state.executionLeases().filter(item => item.status === "ACTIVE" && Date.parse(item.expiresAt) <= this.now().getTime())) {
            this.state.saveExecutionLease({ ...lease, status: "STALE", recoveryMetadata: { classifiedAt: this.now().toISOString() } });
            const run = this.requireRun(lease.runId);
            if (ACTIVE.includes(run.status)) {
                const updated = { ...run, status: "RECOVERING" as const, lastHeartbeatAt: this.now().toISOString(),
                    resumeCheckpoint: run.activeStageId ?? "RUN_START" };
                this.state.saveProductionRun(updated); this.event(updated, "RUN_RECOVERY_REQUIRED", "Stale execution lease requires deterministic recovery.", { leaseId: lease.leaseId }, "WARN");
                recovered.push(updated);
            }
        }
        return recovered;
    }

    health(): RuntimeHealthReport {
        const active = this.activeRun(); const lease = active ? this.activeLease(active.runId) : undefined;
        const heartbeatAge = active ? this.now().getTime() - Date.parse(active.lastHeartbeatAt) : 0;
        const components: RuntimeHealthReport["components"] = [
            { component: "PERSISTENCE", health: "HEALTHY", detail: "Canonical Genesis state is readable." },
            { component: "EVENT_STREAM", health: "HEALTHY", detail: `${this.state.productionEvents().length} durable events.` },
            { component: "EXECUTION_LEASE", health: !active || !LEASE_REQUIRED.includes(active.status) ? "HEALTHY" : lease && heartbeatAge <= this.leaseTtlMs ? "HEALTHY" : "UNHEALTHY",
                detail: !active || !LEASE_REQUIRED.includes(active.status) ? "Current state does not require a mutation lease." : lease ? `Heartbeat age ${heartbeatAge}ms.` : "Active mutation has no lease." },
            { component: "MISSION_QUEUE", health: "HEALTHY", detail: `${this.state.missionQueue().filter(item => item.status === "ELIGIBLE").length} eligible missions.` },
            { component: "ARTIFACT_STORAGE", health: "HEALTHY", detail: `${this.state.previewManifests().length} preview manifests are readable.` },
            { component: "CONTEXT_VALIDATOR", health: "UNKNOWN", detail: "No active context-validation probe is attached." },
            { component: "MISSION_SELECTOR", health: this.state.missionQueue().length ? "HEALTHY" : "UNKNOWN", detail: this.state.missionQueue().length ? "Dependency graph is reconciled." : "Mission queue has not been initialized." },
            { component: "EXECUTION_ADAPTER", health: active ? "HEALTHY" : "UNKNOWN", detail: active ? "A production run is observable." : "No active execution to probe." },
            { component: "TEST_RUNNER", health: active?.validationResults.length ? "HEALTHY" : "UNKNOWN", detail: active?.validationResults.length ? "Validation evidence is attached." : "No current validation evidence." },
            { component: "PREVIEW_SERVICE", health: this.state.previewManifests(active?.runId).at(-1)?.status === "READY" ? "HEALTHY" : "UNKNOWN", detail: "Health follows exact-commit preview evidence." },
            { component: "CERTIFICATION_SERVICE", health: active?.status === "CERTIFIED" || this.history().some(run => run.status === "CERTIFIED") ? "HEALTHY" : "UNKNOWN", detail: "Health follows durable certification evidence." }
        ];
        const health = components.some(item => item.health === "UNHEALTHY") ? "UNHEALTHY"
            : components.some(item => item.health === "DEGRADED") ? "DEGRADED"
            : components.some(item => item.health === "UNKNOWN") ? "UNKNOWN" : "HEALTHY";
        return { health, checkedAt: this.now().toISOString(), components };
    }

    metrics(): RuntimeMetrics {
        const runs = this.state.productionRuns(); const durations = runs.map(run => run.durationMs).filter((value): value is number => value !== undefined).sort((a,b) => a-b);
        return { runsStarted: runs.length, runsCompleted: runs.filter(run => ["COMPLETED", "CERTIFIED"].includes(run.status)).length,
            runsFailed: runs.filter(run => run.status === "FAILED").length, runsBlocked: runs.filter(run => run.status === "BLOCKED").length,
            runsRecovered: this.state.productionEvents().filter(event => event.type === "RUN_RECOVERY_REQUIRED").length,
            totalDurationMs: durations.reduce((sum, value) => sum + value, 0), medianDurationMs: durations.length ? durations[Math.floor(durations.length / 2)] : 0,
            repairAttempts: runs.reduce((sum, run) => sum + run.repairAttempts, 0),
            certificationRate: runs.length ? runs.filter(run => run.status === "CERTIFIED").length / runs.length : 0,
            queueDepth: this.state.missionQueue().filter(item => ["QUEUED", "ELIGIBLE"].includes(item.status)).length,
            activeRunCount: runs.filter(run => ACTIVE.includes(run.status)).length,
            staleLeaseCount: this.state.executionLeases().filter(lease => lease.status === "STALE").length };
    }

    snapshot(): MissionControlSnapshot {
        const activeRun = this.activeRun(); const history = this.history();
        const queue = new GovernedMissionQueue(); const items = this.state.missionQueue();
        return { connection: "CONNECTED", status: activeRun?.status ?? "IDLE", activeRun,
            activeStage: activeRun?.activeStageId ? this.state.productionStages(activeRun.runId).find(stage => stage.stageId === activeRun.activeStageId) : undefined,
            activeLease: activeRun ? this.activeLease(activeRun.runId) : undefined,
            lastRun: history.find(run => run.runId !== activeRun?.runId), history: history.slice(0, 20),
            latestPreview: this.state.previewManifests(activeRun?.runId).at(-1) ?? this.state.previewManifests().at(-1), nextMission: queue.next(items),
            recentEvents: this.state.productionEvents(activeRun?.runId).slice(-100), health: this.health(), metrics: this.metrics(),
            generatedAt: this.now().toISOString(), sourceVersion: "PBOS-PRODUCTION-RUNTIME-1" };
    }

    private acquireLease(run: ProductionRun): ExecutionLease {
        const healthy = this.state.executionLeases().find(lease => lease.status === "ACTIVE" && lease.repository === run.repository && Date.parse(lease.expiresAt) > this.now().getTime());
        if (healthy) throw new Error(`Healthy execution lease ${healthy.leaseId} is owned by run ${healthy.runId}.`);
        const timestamp = this.now().toISOString();
        const lease: ExecutionLease = { leaseId: randomUUID(), runId: run.runId, processId: process.pid, host: hostname(), actorId: run.actorId,
            acquiredAt: timestamp, lastRenewedAt: timestamp, expiresAt: new Date(this.now().getTime() + this.leaseTtlMs).toISOString(),
            scope: `repository:${run.repository}`, repository: run.repository, branch: run.currentBranch, commit: run.currentCommit, status: "ACTIVE" };
        this.state.saveExecutionLease(lease); this.event(run, "LEASE_ACQUIRED", "Execution lease acquired.", { leaseId: lease.leaseId }); return lease;
    }

    private releaseLease(runId: string, method: NonNullable<ExecutionLease["releaseMethod"]>): void {
        const lease = this.activeLease(runId); if (!lease) return;
        this.state.saveExecutionLease({ ...lease, status: "RELEASED", releaseMethod: method, lastRenewedAt: this.now().toISOString() });
        this.event(this.requireRun(runId), "LEASE_RELEASED", "Execution lease released.", { leaseId: lease.leaseId, method });
    }
    private activeLease(runId: string): ExecutionLease | undefined {
        return [...this.state.executionLeases()].reverse().find(lease => lease.runId === runId && lease.status === "ACTIVE");
    }
    private requireRun(runId: string): ProductionRun { const run = this.state.productionRun(runId); if (!run) throw new Error(`Production run not found: ${runId}`); return run; }
    private requireActor(runId: string, actorId: string): ProductionRun {
        const run = this.requireRun(runId);
        if (run.actorId !== actorId) throw new Error(`Operator ${actorId} does not own run ${runId}.`);
        return run;
    }
    private event(run: ProductionRun, type: string, summary: string, payload: Readonly<Record<string, unknown>>,
        severity: ProductionEvent["severity"] = "INFO", parentEntityId = run.runId): void {
        const events = this.state.productionEvents();
        const event: ProductionEvent = { eventId: randomUUID(), sequence: (events.at(-1)?.sequence ?? 0) + 1, type,
            timestamp: this.now().toISOString(), runId: run.runId, parentEntityId, actorId: run.actorId, severity,
            status: run.status, summary, payload: this.redactPayload(payload), repository: run.repository,
            branch: run.currentBranch, commit: run.currentCommit, correlationId: run.runId, traceId: run.parentRunId };
        this.state.appendProductionEvent(event);
    }
    private redact(value: string): string { return value.replace(/(token|secret|password|authorization)=?\s*[^\s]+/gi, "$1=[REDACTED]"); }
    private redactPayload(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
        return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key,
            /token|secret|password|authorization/i.test(key) ? "[REDACTED]" : typeof value === "string" ? this.redact(value) : value]));
    }
}
