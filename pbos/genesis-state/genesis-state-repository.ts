import { AutonomousBuildGrant } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GenesisSystemDefinition } from "../genesis-console/system-definition";
import { SystemBlueprint } from "../system-blueprint";
import { JsonStateStore } from "./json-state-store";
import type { RemediationRun } from "../validation-automation/contracts";
import type { AutonomousBuildBatch, BackgroundMonitorJob, BatchTelemetryEvent, OperatorMemoRecord } from "../operator-continuity/contracts";
import type { ExecutionLease, MissionQueueItem, PreviewManifest, ProductionEvent, ProductionRun, ProductionStage } from "../production-runtime/contracts";

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
    appendProductionEvent(event: ProductionEvent): void {
        if ((this.store.read().productionEvents ?? []).some(item => item.eventId === event.eventId)) return;
        this.store.update(state => ({ ...state, productionEvents: [...(state.productionEvents ?? []), event] }));
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
