import { AutonomousBuildGrant } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GenesisSystemDefinition } from "../genesis-console/system-definition";
import { SystemBlueprint } from "../system-blueprint";
import { JsonStateStore } from "./json-state-store";
import type { RemediationRun } from "../validation-automation/contracts";
import type { AutonomousBuildBatch, BackgroundMonitorJob, BatchTelemetryEvent, OperatorMemoRecord } from "../operator-continuity/contracts";
import { TERMINAL_PRODUCTION_STATUSES } from "../production-runtime/contracts";
import type { ExecutionLease, MissionQueueItem, PreviewManifest, ProductionEvent, ProductionRecoveryEpoch, ProductionRun, ProductionStage } from "../production-runtime/contracts";

export interface GenesisAuditEvent {
    readonly eventId: string;
    readonly type: string;
    readonly actorId: string;
    readonly resource: string;
    readonly occurredAt: string;
    readonly evidence: Readonly<Record<string, unknown>>;
}

interface DurableGenesisState {
    readonly systems: readonly GenesisSystemDefinition[];
    readonly blueprints: readonly unknown[];
    readonly sessions: readonly unknown[];
    readonly grants: readonly unknown[];
    readonly audit: readonly GenesisAuditEvent[];
    readonly remediationRuns?: readonly RemediationRun[];
    readonly memos?: readonly OperatorMemoRecord[];
    readonly backgroundJobs?: readonly BackgroundMonitorJob[];
    readonly autonomousBatches?: readonly AutonomousBuildBatch[];
    readonly batchTelemetry?: readonly BatchTelemetryEvent[];
    readonly productionRuns?: readonly ProductionRun[];
    readonly productionStages?: readonly ProductionStage[];
    readonly productionEvents?: readonly ProductionEvent[];
    readonly productionRecoveryEpochs?: readonly ProductionRecoveryEpoch[];
    readonly executionLeases?: readonly ExecutionLease[];
    readonly missionQueue?: readonly MissionQueueItem[];
    readonly previewManifests?: readonly PreviewManifest[];
}

const dateKeys = new Set(["createdAt", "activatedAt", "issuedAt", "expiresAt", "revokedAt", "decidedAt", "requestedAt"]);
const revive = <T>(value: unknown): T => JSON.parse(JSON.stringify(value), (key, item) =>
    dateKeys.has(key) && typeof item === "string" ? new Date(item) : item) as T;

export class GenesisStateRepository {
    private readonly store: JsonStateStore<DurableGenesisState>;
    constructor(path: string) {
        this.store = new JsonStateStore(path, () => ({ systems: [], blueprints: [], sessions: [], grants: [], audit: [] }));
    }

    systems(): readonly GenesisSystemDefinition[] { return [...this.store.read().systems]; }
    saveSystem(system: GenesisSystemDefinition): void {
        this.store.update(state => ({ ...state, systems: [...state.systems.filter(item => item.systemId !== system.systemId), system] }));
    }

    blueprints(): readonly SystemBlueprint[] { return this.store.read().blueprints.map(value => revive<SystemBlueprint>(value)); }
    saveBlueprint(blueprint: SystemBlueprint): void {
        this.store.update(state => ({ ...state, blueprints: [...state.blueprints.filter(item => (item as SystemBlueprint).blueprintId !== blueprint.blueprintId), blueprint] }));
    }

    sessions(): readonly GenesisBuildSession[] { return this.store.read().sessions.map(value => revive<GenesisBuildSession>(value)); }
    saveSession(session: GenesisBuildSession): void {
        this.store.update(state => ({ ...state, sessions: [...state.sessions.filter(item => (item as GenesisBuildSession).sessionId !== session.sessionId), session] }));
    }

    grants(): readonly AutonomousBuildGrant[] { return this.store.read().grants.map(value => revive<AutonomousBuildGrant>(value)); }
    saveGrant(grant: AutonomousBuildGrant): void {
        this.store.update(state => ({ ...state, grants: [...state.grants.filter(item => (item as AutonomousBuildGrant).grantId !== grant.grantId), grant] }));
    }
    grant(grantId: string): AutonomousBuildGrant | undefined { return this.grants().find(grant => grant.grantId === grantId); }

    appendAudit(event: GenesisAuditEvent): void {
        this.store.update(state => ({ ...state, audit: [...state.audit, event] }));
    }
    audit(): readonly GenesisAuditEvent[] { return [...this.store.read().audit]; }

    remediationRuns(): readonly RemediationRun[] { return [...(this.store.read().remediationRuns ?? [])]; }
    remediationRun(runId: string): RemediationRun | undefined { return this.remediationRuns().find(run => run.runId === runId); }
    saveRemediationRun(run: RemediationRun): void {
        this.store.update(state => ({ ...state, remediationRuns: [...(state.remediationRuns ?? []).filter(item => item.runId !== run.runId), run] }));
    }
    memos(): readonly OperatorMemoRecord[] { return [...(this.store.read().memos ?? [])]; }
    saveMemo(memo: OperatorMemoRecord): void { this.store.update(state => ({ ...state, memos: [...(state.memos ?? []), memo] })); }
    backgroundJobs(): readonly BackgroundMonitorJob[] { return [...(this.store.read().backgroundJobs ?? [])]; }
    saveBackgroundJob(job: BackgroundMonitorJob): void {
        this.store.update(state => ({ ...state, backgroundJobs: [...(state.backgroundJobs ?? []).filter(item => item.jobId !== job.jobId), job] }));
    }
    backgroundJobForRun(runId: string): BackgroundMonitorJob | undefined {
        return [...this.backgroundJobs()].reverse().find(job => job.runId === runId);
    }
    autonomousBatches(): readonly AutonomousBuildBatch[] { return [...(this.store.read().autonomousBatches ?? [])]; }
    saveAutonomousBatch(batch: AutonomousBuildBatch): void {
        this.store.update(state => ({ ...state, autonomousBatches: [...(state.autonomousBatches ?? [])
            .filter(item => item.batchId !== batch.batchId), batch] }));
    }
    batchTelemetry(batchId?: string): readonly BatchTelemetryEvent[] {
        return [...(this.store.read().batchTelemetry ?? [])].filter(item => !batchId || item.batchId === batchId);
    }
    appendBatchTelemetry(event: BatchTelemetryEvent): void {
        this.store.update(state => ({ ...state, batchTelemetry: [...(state.batchTelemetry ?? []), event] }));
    }

    productionRuns(): readonly ProductionRun[] { return [...(this.store.read().productionRuns ?? [])]; }
    productionRun(runId: string): ProductionRun | undefined { return this.productionRuns().find(run => run.runId === runId); }
    saveProductionRun(run: ProductionRun): void {
        this.store.update(state => ({ ...state, productionRuns: [...(state.productionRuns ?? []).filter(item => item.runId !== run.runId), run] }));
    }
    productionStages(runId?: string): readonly ProductionStage[] {
        return [...(this.store.read().productionStages ?? [])].filter(stage => !runId || stage.runId === runId);
    }
    saveProductionStage(stage: ProductionStage): void {
        this.store.update(state => ({ ...state, productionStages: [...(state.productionStages ?? []).filter(item => item.stageId !== stage.stageId), stage] }));
    }
    productionEvents(runId?: string): readonly ProductionEvent[] {
        return [...(this.store.read().productionEvents ?? [])].filter(event => !runId || event.runId === runId)
            .sort((left, right) => left.sequence - right.sequence);
    }
    /**
     * Allocate an event sequence inside the durable store's cross-process lock.
     * Allocating before this transaction lets two writers observe the same last event.
     * Never rewrite existing history, including legacy duplicate sequences.
     */
    appendProductionEvent(event: Omit<ProductionEvent, "sequence">): void {
        this.store.update(state => {
            const events = state.productionEvents ?? [];
            if (events.some(item => item.eventId === event.eventId)) return state;
            const lastSequence = events.reduce((maximum, item) => Math.max(maximum, item.sequence), 0);
            return { ...state, productionEvents: [...events, { ...event, sequence: lastSequence + 1 }] };
        });
    }
    recordClosedPullRequestReplacement(before: ProductionRun, historical: RemediationRun, updated: ProductionRun,
        replacement: RemediationRun, grantId: string, approval: GenesisAuditEvent, event: Omit<ProductionEvent, "sequence">): void {
        this.store.update(state => {
            const runs = state.productionRuns ?? [];
            const remediations = state.remediationRuns ?? [];
            const events = state.productionEvents ?? [];
            const grant = (state.grants as readonly AutonomousBuildGrant[]).find(item => item.grantId === grantId);
            const occurredAt = Date.parse(approval.occurredAt);
            if (JSON.stringify(runs.find(run => run.runId === before.runId)) !== JSON.stringify(before) ||
                JSON.stringify(remediations.find(run => run.runId === historical.runId)) !== JSON.stringify(historical) ||
                !grant || grant.revokedAt || !(Date.parse(String(grant.expiresAt)) > occurredAt) ||
                runs.some(run => run.repository === before.repository && !TERMINAL_PRODUCTION_STATUSES.includes(run.status)) ||
                (state.executionLeases ?? []).some(lease => lease.repository === before.repository && lease.status === "ACTIVE") ||
                remediations.some(run => run.pullRequest.repository === replacement.pullRequest.repository &&
                    run.pullRequest.number === replacement.pullRequest.number) ||
                state.audit.some(entry => entry.eventId === approval.eventId)) {
                throw new Error("Closed pull request replacement lineage or authority changed before registration.");
            }
            const sequence = events.reduce((maximum, item) => Math.max(maximum, item.sequence), 0) + 1;
            return { ...state,
                productionRuns: runs.map(run => run.runId === before.runId ? updated : run),
                remediationRuns: [...remediations, replacement], audit: [...state.audit, approval],
                productionEvents: [...events, { ...event, sequence }] };
        });
    }

    renewClosedPullRequestApproval(expected: RemediationRun, updated: RemediationRun, grantId: string,
        approval: GenesisAuditEvent, runId: string): void {
        this.store.update(state => {
            const runs = state.productionRuns ?? [];
            const remediations = state.remediationRuns ?? [];
            const run = runs.find(item => item.runId === runId);
            const grant = (state.grants as readonly AutonomousBuildGrant[]).find(item => item.grantId === grantId);
            const occurredAt = Date.parse(approval.occurredAt);
            if (!run || run.status !== "BLOCKED" || run.currentCommit !== expected.headSha ||
                run.evidenceIds.filter(id => id.startsWith("remediation-run:")).at(-1) !== `remediation-run:${expected.runId}` ||
                JSON.stringify(remediations.find(item => item.runId === expected.runId)) !== JSON.stringify(expected) ||
                !grant || grant.revokedAt || !(Date.parse(String(grant.expiresAt)) > occurredAt) ||
                runs.some(item => item.repository === run.repository && !TERMINAL_PRODUCTION_STATUSES.includes(item.status)) ||
                (state.executionLeases ?? []).some(item => item.repository === run.repository && item.status === "ACTIVE") ||
                state.audit.some(item => item.eventId === approval.eventId)) {
                throw new Error("Recovery lineage, lease, or authority changed before approval renewal.");
            }
            return { ...state, remediationRuns: remediations.map(item => item.runId === expected.runId ? updated : item),
                audit: [...state.audit, approval] };
        });
    }

    productionRecoveryEpochs(runId?: string): readonly ProductionRecoveryEpoch[] {
        return [...(this.store.read().productionRecoveryEpochs ?? [])]
            .filter(epoch => !runId || epoch.runId === runId)
            .sort((left, right) => left.epochNumber - right.epochNumber);
    }
    productionRecoveryEpoch(recoveryEpochId: string): ProductionRecoveryEpoch | undefined {
        return this.productionRecoveryEpochs().find(epoch => epoch.recoveryEpochId === recoveryEpochId);
    }
    saveProductionRecoveryEpoch(epoch: ProductionRecoveryEpoch): void {
        this.store.update(state => ({ ...state, productionRecoveryEpochs: [...(state.productionRecoveryEpochs ?? [])
            .filter(item => item.recoveryEpochId !== epoch.recoveryEpochId), epoch] }));
    }
    executionLeases(): readonly ExecutionLease[] { return [...(this.store.read().executionLeases ?? [])]; }
    saveExecutionLease(lease: ExecutionLease): void {
        this.store.update(state => ({ ...state, executionLeases: [...(state.executionLeases ?? []).filter(item => item.leaseId !== lease.leaseId), lease] }));
    }
    missionQueue(systemId?: string): readonly MissionQueueItem[] {
        return [...(this.store.read().missionQueue ?? [])].filter(item => !systemId || item.systemId === systemId);
    }
    saveMissionQueue(items: readonly MissionQueueItem[], systemId: string): void {
        this.store.update(state => ({ ...state, missionQueue: [...(state.missionQueue ?? []).filter(item => item.systemId !== systemId), ...items] }));
    }
    previewManifests(runId?: string): readonly PreviewManifest[] {
        return [...(this.store.read().previewManifests ?? [])].filter(item => !runId || item.runId === runId);
    }
    savePreviewManifest(manifest: PreviewManifest): void {
        this.store.update(state => ({ ...state, previewManifests: [...(state.previewManifests ?? []).filter(item => item.previewId !== manifest.previewId), manifest] }));
    }
}
