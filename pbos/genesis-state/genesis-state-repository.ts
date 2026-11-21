import { GovernedMissionQueue } from "../production-runtime/mission-queue";
import { AutonomousBuildGrant } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GenesisSystemDefinition } from "../genesis-console/system-definition";
import { SystemBlueprint } from "../system-blueprint";
import { JsonStateStore } from "./json-state-store";
import { lstatSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hostname } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { DISPOSABLE_EVIDENCE_STAGES } from "../production-runtime/contracts";
import type { RemediationRun } from "../validation-automation/contracts";
import type { AutonomousBuildBatch, BackgroundMonitorJob, BatchTelemetryEvent, OperatorMemoRecord } from "../operator-continuity/contracts";
import type { DisposableEvidenceRecord, DisposableEvidenceStage, ExecutionLease, MissionQueueItem, PreviewManifest, ProductionEvent, ProductionRecoveryEpoch, ProductionRun, ProductionStage } from "../production-runtime/contracts";

export interface GenesisAuditEvent {
    readonly eventId: string;
    readonly type: string;
    readonly actorId: string;
    readonly resource: string;
    readonly occurredAt: string;
    readonly evidence: Readonly<Record<string, unknown>>;
}

interface DurableGenesisState {
    readonly disposableNamespace?: string;
    readonly disposableAuthorityId?: string;
    readonly disposablePlacement?: readonly [host: string, statePath: string, device: string, directoryInode: string];
    readonly disposableEvidence?: readonly DisposableEvidenceRecord[];
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
    private readonly disposableAuthorityId?: string;
    private readonly disposablePlacement?: DurableGenesisState["disposablePlacement"];
    constructor(path: string, private readonly requireDisposableNamespace?: string) {
        this.store = new JsonStateStore(path, () => ({ systems: [], blueprints: [], sessions: [], grants: [], audit: [] }),
            !requireDisposableNamespace, requireDisposableNamespace ? value => {
                const current = value as DurableGenesisState;
                if (current.disposableNamespace !== requireDisposableNamespace ||
                    (this.disposableAuthorityId && current.disposableAuthorityId !== this.disposableAuthorityId) ||
                    (this.disposablePlacement && JSON.stringify(current.disposablePlacement) !== JSON.stringify(disposablePlacement(path)))) {
                    throw new Error("Disposable authority changed or is inconsistent.");
                }
            } : undefined);
        if (requireDisposableNamespace) {
            const metadata = lstatSync(path);
            if (realpathSync(path) !== resolve(path) || !metadata.isFile() || (metadata.mode & 0o077) !== 0 ||
                this.store.read().disposableNamespace !== requireDisposableNamespace) {
                throw new Error("Expected a private, initialized disposable Genesis state.");
            }
            const loaded = this.store.read();
            this.disposableAuthorityId = loaded.disposableAuthorityId;
            this.disposablePlacement = loaded.disposablePlacement;
            if (this.disposablePlacement) this.store.read();
        }
    }

    assertDisposableAuthority(expectedId: string): void {
        if (!/^[a-f0-9-]{36}$/.test(expectedId) || !this.requireDisposableNamespace || !this.disposablePlacement ||
            this.disposableAuthorityId !== expectedId || this.store.read().disposableAuthorityId !== expectedId) {
            throw new Error("Trusted disposable authority is unavailable or does not match deployment.");
        }
    }

    static createDisposable(path: string, namespace: string): GenesisStateRepository {
        const directory = lstatSync(dirname(path));
        if (!/^[A-Za-z0-9._-]+$/.test(namespace) || realpathSync(dirname(path)) !== resolve(dirname(path)) ||
            !directory.isDirectory() || (directory.mode & 0o077) !== 0) {
            throw new Error("Disposable Genesis requires a canonical private directory and namespace.");
        }
        writeFileSync(path, JSON.stringify({ disposableNamespace: namespace, disposableAuthorityId: randomUUID(),
            disposablePlacement: disposablePlacement(path), systems: [], blueprints: [],
            sessions: [], grants: [], audit: [] }) + "\n", { flag: "wx", mode: 0o600 });
        return new GenesisStateRepository(path, namespace);
    }

    assertDisposableNamespace(namespace: string): void {
        if (this.requireDisposableNamespace !== namespace || this.store.read().disposableNamespace !== namespace) {
            throw new Error("Disposable mission state is missing or does not match its signed namespace.");
        }
    }

    assertRunNamespace(namespace: string | undefined): void {
        if (this.store.read().disposableNamespace !== namespace || this.requireDisposableNamespace !== namespace) {
            throw new Error("Run and authoritative state must share the same execution namespace.");
        }
    }

    /** Reserve the mission and existing PBOS execution lease in the same cross-process transaction. */
    claimDisposableRun(run: ProductionRun, lease: ExecutionLease): void {
        const attempt = run.disposableAttempt;
        if (!attempt || this.requireDisposableNamespace !== attempt.namespace) throw new Error("Disposable state binding is required.");
        this.store.update(state => {
            if (state.disposableNamespace !== attempt.namespace) throw new Error("Disposable state namespace changed.");
            const runs = state.productionRuns ?? [];
            const leases = state.executionLeases ?? [];
            if (runs.some(previous => previous.runId === run.runId || previous.authorizationArtifactId === run.authorizationArtifactId ||
                previous.disposableAttempt?.attemptId === attempt.attemptId ||
                (previous.repository.toLowerCase() === run.repository.toLowerCase() &&
                    previous.disposableAttempt?.missionId === attempt.missionId))) {
                throw new Error("Disposable mission or signed attempt has already been claimed.");
            }
            if (leases.some(existing => existing.repository.toLowerCase() === run.repository.toLowerCase() &&
                existing.status === "ACTIVE")) throw new Error("Existing execution lease requires review before admission.");
            const next = new GovernedMissionQueue().next((state.missionQueue ?? []).filter(item => item.systemId === run.systemId));
            if (next?.missionId !== attempt.missionId || next.title !== run.selectedMission || !next.approvalRequired) {
                throw new Error("Disposable mission is no longer the eligible governed queue entry.");
            }
            return { ...state, productionRuns: [...runs, run], executionLeases: [...leases, lease] };
        });
    }

    /** Atomically fence the sole dispatch and acknowledge an observed worker return. */
    markDisposableWorker(runId: string, phase: "started" | "finished", host: string, pid: number, now: Date): void {
        this.store.update(state => {
            const runs = state.productionRuns ?? [];
            const run = runs.find(item => item.runId === runId);
            const attempt = run?.disposableAttempt;
            const lease = (state.executionLeases ?? []).find(item => item.runId === runId && item.status === "ACTIVE");
            if (!attempt || attempt.quarantine || !run || this.requireDisposableNamespace !== attempt.namespace || state.disposableNamespace !== attempt.namespace ||
                run.status !== "RUNNING" || !lease || lease.host !== host || lease.processId !== pid ||
                !(Date.parse(lease.expiresAt) > now.getTime()) ||
                (phase === "started" ? Boolean(attempt.workerStartedAt) : !attempt.workerStartedAt || Boolean(attempt.workerFinishedAt))) {
                throw new Error("Disposable worker dispatch checkpoint or execution lease is invalid.");
            }
            const checkpoint = phase === "started" ? "workerStartedAt" : "workerFinishedAt";
            return { ...state, productionRuns: runs.map(item => item.runId === runId
                ? { ...run, disposableAttempt: { ...attempt, [checkpoint]: now.toISOString() } } : item) };
        });
    }

    renewDisposableLease(runId: string, host: string, pid: number, now: Date, expiresAt: string, fence?: string): ProductionRun {
        const updated = this.store.update(state => {
            const runs = state.productionRuns ?? [];
            const leases = state.executionLeases ?? [];
            const run = runs.find(item => item.runId === runId);
            const lease = leases.find(item => item.runId === runId && item.status === "ACTIVE");
            if (!run?.disposableAttempt || run.disposableAttempt.quarantine || this.requireDisposableNamespace !== run.disposableAttempt.namespace ||
                state.disposableNamespace !== run.disposableAttempt.namespace ||
                !lease || (fence !== undefined && lease.leaseId !== fence) || lease.host !== host || lease.processId !== pid ||
                !(Date.parse(lease.expiresAt) > now.getTime())) {
                throw new Error("Disposable execution lease is lost or expired.");
            }
            return { ...state, productionRuns: runs.map(item => item.runId === runId
                ? { ...run, lastHeartbeatAt: now.toISOString() } : item),
                executionLeases: leases.map(item => item.leaseId === lease.leaseId
                    ? { ...lease, lastRenewedAt: now.toISOString(), expiresAt } : item) };
        });
        return updated.productionRuns!.find(item => item.runId === runId)!;
    }

    inspectDisposableRun(runId: string) {
        const state = this.store.read();
        const run = state.productionRuns?.find(item => item.runId === runId);
        if (!run?.disposableAttempt || this.requireDisposableNamespace !== run.disposableAttempt.namespace ||
            state.disposableNamespace !== run.disposableAttempt.namespace) {
            throw new Error("Disposable recovery inspection requires a matching persisted run.");
        }
        return {
            run,
            activeLease: state.executionLeases?.find(item => item.runId === runId && item.status === "ACTIVE"),
            evidence: (state.disposableEvidence ?? []).filter(record => record.runId === runId),
        };
    }

    quarantineDisposableRun(runId: string, attemptId: string, operatorId: string, approvalDigest: string, now: Date): void {
        this.store.update(state => {
            const run = state.productionRuns?.find(item => item.runId === runId);
            const attempt = run?.disposableAttempt;
            if (!run || !attempt || attempt.attemptId !== attemptId || attempt.quarantine ||
                this.requireDisposableNamespace !== attempt.namespace || state.disposableNamespace !== attempt.namespace ||
                state.executionLeases?.some(lease => lease.runId === runId && lease.status === "ACTIVE" &&
                    !(Date.parse(lease.expiresAt) <= now.getTime()))) {
                throw new Error("Disposable attempt is already quarantined, still leased, or cannot be verified.");
            }
            return { ...state, productionRuns: state.productionRuns!.map(item => item.runId === runId
                ? { ...run, disposableAttempt: { ...attempt, quarantine: {
                    recordedAt: now.toISOString(), operatorId, approvalDigest,
                } } } : item) };
        });
    }

    disposableEvidence(runId: string): readonly DisposableEvidenceRecord[] {
        return (this.store.read().disposableEvidence ?? []).filter(record => record.runId === runId);
    }

    appendDisposableEvidence(runId: string, stage: DisposableEvidenceStage, payload: DisposableEvidenceRecord["payload"], fence?: string): DisposableEvidenceRecord {
        const updated = this.store.update(state => {
            const evidence = state.disposableEvidence ?? [];
            const run = state.productionRuns?.find(item => item.runId === runId);
            const attempt = run?.disposableAttempt;
            const chain = evidence.filter(item => item.runId === runId);
            if (!run || !attempt || attempt.quarantine || state.disposableNamespace !== attempt.namespace ||
                this.requireDisposableNamespace !== attempt.namespace || DISPOSABLE_EVIDENCE_STAGES[chain.length] !== stage ||
                !verifyDisposableEvidence(chain) || (stage === "BUILD" && !attempt.workerFinishedAt)) {
                throw new Error("Disposable evidence is out of order or lacks an authoritative run checkpoint.");
            }
            if (chain[2]?.payload.source === "provider-attested-return") {
                throw new Error("Provider evidence must be completed by the independent verifier.");
            }
            if (stage === "BUILD") {
                const lease = state.executionLeases?.find(item => item.runId === runId && item.status === "ACTIVE");
                if (!lease || lease.leaseId !== fence || lease.host !== hostname() || lease.processId !== process.pid ||
                    run.status !== "RUNNING" || !(Date.parse(lease.expiresAt) > Date.now())) {
                    throw new Error("BUILD evidence rejected by the active execution fence.");
                }
            }
            const unsigned = { runId, attemptId: attempt.attemptId, approvalDigest: attempt.approvalDigest,
                sourceSha: run.startingCommit, stage, recordedAt: new Date().toISOString(),
                previousDigest: chain.at(-1)?.digest ?? null, payload };
            const record = { ...unsigned, digest: hashEvidence(unsigned) };
            if (!verifyDisposableEvidence([...chain, record])) throw new Error("Invalid disposable stage evidence payload.");
            return { ...state, disposableEvidence: [...evidence, record] };
        });
        return updated.disposableEvidence!.at(-1)!;
    }

    completeDisposableEvidence(runId: string, expectedBuildDigest: string,
        suffix: readonly Readonly<{ stage: DisposableEvidenceStage; payload: DisposableEvidenceRecord["payload"] }>[]) {
        return this.store.update(state => {
            const evidence = state.disposableEvidence ?? [];
            const run = state.productionRuns?.find(item => item.runId === runId);
            const attempt = run?.disposableAttempt;
            const chain = evidence.filter(item => item.runId === runId);
            const build = chain.at(-1);
            if (!run || !attempt?.workerFinishedAt || attempt.quarantine ||
                state.disposableNamespace !== attempt.namespace || this.requireDisposableNamespace !== attempt.namespace ||
                chain.length !== 3 || suffix.length !== 4 || build?.digest !== expectedBuildDigest ||
                build.payload.source !== "provider-attested-return") {
                throw new Error("Independent evidence no longer matches the authoritative BUILD checkpoint.");
            }
            const records = suffix.map(({ stage, payload }) => {
                const record = { runId, attemptId: attempt.attemptId, approvalDigest: attempt.approvalDigest,
                    sourceSha: run.startingCommit, stage, recordedAt: new Date().toISOString(),
                    previousDigest: chain.at(-1)!.digest, payload };
                const signed = { ...record, digest: hashEvidence(record) };
                chain.push(signed);
                return signed;
            });
            if (!verifyDisposableEvidence(chain, true)) throw new Error("Independent evidence suffix is invalid.");
            return { ...state, disposableEvidence: [...evidence, ...records] };
        }).disposableEvidence!.filter(record => record.runId === runId);
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

function disposablePlacement(path: string): NonNullable<DurableGenesisState["disposablePlacement"]> {
    const parent = dirname(resolve(path));
    const stat = lstatSync(parent, { bigint: true });
    if (realpathSync(parent) !== parent || !stat.isDirectory() || (stat.mode & 0o077n) !== 0n) {
        throw new Error("Disposable authority directory is unavailable or no longer private.");
    }
    return [hostname(), resolve(path), stat.dev.toString(), stat.ino.toString()];
}

function hashEvidence(record: Omit<DisposableEvidenceRecord, "digest">): string {
    // Explicit field order also supports validation after a JSON round trip.
    return createHash("sha256").update(JSON.stringify([record.runId, record.attemptId, record.approvalDigest,
        record.sourceSha, record.stage, record.recordedAt, record.previousDigest, record.payload])).digest("hex");
}

/** Verify the ordered evidence chain. A valid prefix carries no certification authority. */
export function verifyDisposableEvidence(records: readonly DisposableEvidenceRecord[], requireComplete = false): boolean {
    if (requireComplete && records.length !== DISPOSABLE_EVIDENCE_STAGES.length) return false;
    return records.every((record, index) => {
        if (!record || typeof record !== "object") return false;
        const first = records[0];
        const previous = records[index - 1];
        return DISPOSABLE_EVIDENCE_STAGES[index] === record.stage &&
            record.runId === first.runId && record.attemptId === first.attemptId &&
            record.approvalDigest === first.approvalDigest && record.sourceSha === first.sourceSha &&
            /^[a-f0-9]{64}$/.test(record.approvalDigest) && /^[a-f0-9]{40}$/.test(record.sourceSha) &&
            Number.isFinite(Date.parse(record.recordedAt)) &&
            (!previous || Date.parse(previous.recordedAt) <= Date.parse(record.recordedAt)) &&
            validStagePayload(record, records) &&
            record.previousDigest === (previous?.digest ?? null) &&
            record.digest === hashEvidence(record);
    });
}

function validStagePayload(record: DisposableEvidenceRecord, records: readonly DisposableEvidenceRecord[]): boolean {
    const { payload, stage } = record;
    if (!payload || typeof payload !== "object") return false;
    const sha256 = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
    const present = (value: unknown) => typeof value === "string" && value.trim().length > 0;
    const paths = (value: unknown) => Array.isArray(value) && value.length > 0 &&
        value.every(present) && new Set(value).size === value.length;
    switch (stage) {
        case "SELECT": return present(payload.missionId) && present(payload.workerId);
        case "PLAN": return sha256(payload.planHash) && paths(payload.allowedPaths);
        case "BUILD": {
            const allowed = records[1]?.payload.allowedPaths;
            return Array.isArray(allowed) && Array.isArray(payload.changedPaths) && paths(payload.changedPaths) &&
                payload.changedPaths.every(path => allowed.includes(path)) &&
                payload.workerId === records[0]?.payload.workerId && sha256(payload.diffDigest) && sha256(payload.outputDigest);
        }
        case "TEST": return payload.diffDigest === records[2]?.payload.diffDigest && sha256(payload.testResultsDigest);
        case "VERIFY": return payload.diffDigest === records[2]?.payload.diffDigest && sha256(payload.verificationDigest);
        case "DOCUMENT": return sha256(payload.documentationDigest);
        case "PROPOSE": return typeof payload.proposalSha === "string" && /^[a-f0-9]{40}$/.test(payload.proposalSha) &&
            payload.proposalSha !== record.sourceSha && payload.ciHeadSha === payload.proposalSha &&
            sha256(payload.ciReceiptDigest);
    }
}
