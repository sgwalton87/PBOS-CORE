import { createHash, randomUUID } from "node:crypto";
import type { ExecutionLease, ProductionEvent, ProductionRun, ProductionStage } from "./contracts";
import type { HostedExecutionLease } from "./hosted-approved-mission";

export interface PlanReadyHandoff {
    readonly runId: string;
    readonly missionId: string;
    readonly repository: string;
    readonly commit: string;
    readonly nonce: string;
    readonly scopeDigest: string;
    readonly oldLeaseId: string;
    readonly stateGeneration: string;
    readonly lockGeneration: string;
    readonly stateSha256: string;
}

interface Snapshot {
    disposableNamespace?: string;
    productionRuns: ProductionRun[];
    productionEvents: ProductionEvent[];
    productionStages?: ProductionStage[];
    executionLeases: ExecutionLease[];
}

interface RecoveryObservations {
    readonly terminatedController: boolean;
    readonly journal: "absent" | "reserved" | "unknown";
    readonly checkpointCount: number;
    readonly consumedNonce: string;
    readonly fenceCurrent: boolean;
}

/** The immutable checkpoint is inspectable before acquiring any new authority. */
export function inspectPlanReadyCheckpoint(bytes: string, pin: PlanReadyHandoff, now: Date) {
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== pin.stateSha256 || !/^[1-9][0-9]*$/.test(pin.stateGeneration) ||
        !/^[1-9][0-9]*$/.test(pin.lockGeneration)) throw Error("RECOVERY_STATE_PIN");
    const snapshot = JSON.parse(bytes) as Snapshot;
    const matches = snapshot.productionRuns.filter(item => item.runId === pin.runId);
    const [run] = matches;
    const attempt = run?.disposableAttempt;
    if (matches.length !== 1 || !attempt || !attempt.namespace || snapshot.disposableNamespace !== attempt.namespace ||
        attempt.missionId !== pin.missionId || attempt.attemptId !== pin.nonce || attempt.scopeDigest !== pin.scopeDigest ||
        run.authorizationArtifactId !== "hosted-approval:" + pin.nonce || run.repository !== pin.repository ||
        run.startingCommit !== pin.commit || run.currentCommit !== pin.commit || run.startingBranch !== run.currentBranch ||
        run.status !== "RUNNING" || run.autonomousContinuation || run.activeStageId || run.stageIds.length ||
        !run.executionPlan || run.executionPlan.runId !== pin.runId || run.executionPlan.missionId !== pin.missionId || attempt.quarantine ||
        attempt.workerStartedAt || attempt.workerFinishedAt ||
        snapshot.productionStages?.some(stage => stage.runId === pin.runId) ||
        snapshot.productionEvents.filter(event => event.runId === pin.runId).at(-1)?.type !== "EXECUTION_PLAN_READY") {
        throw Error("RECOVERY_CHECKPOINT");
    }
    const active = snapshot.executionLeases.filter(lease => lease.status === "ACTIVE" &&
        (lease.runId === pin.runId || lease.repository.toLowerCase() === pin.repository.toLowerCase()));
    const [old] = active;
    if (active.length !== 1 || old.leaseId !== pin.oldLeaseId || old.runId !== pin.runId ||
        old.repository !== pin.repository || old.branch !== run.currentBranch || old.commit !== pin.commit ||
        old.actorId !== run.actorId || !(Date.parse(old.expiresAt) <= now.getTime())) throw Error("RECOVERY_OLD_LEASE");
    return { snapshot, run, old, digest };
}

/** Prepare candidate bytes only. No admission, state write, grant or dispatch.
 * The caller must verify external evidence and own the new Neon fence. */
export function preparePlanReadyLeaseHandoff(bytes: string, pin: PlanReadyHandoff, owner: {
    host: string; pid: number; fence: HostedExecutionLease; now: Date; expiresAt: Date;
}, evidence: RecoveryObservations) {
    if (evidence.terminatedController !== true || evidence.journal !== "absent" || evidence.checkpointCount !== 0 ||
        evidence.consumedNonce !== pin.nonce || evidence.fenceCurrent !== true) throw Error("RECOVERY_EXTERNAL_EVIDENCE");
    const { snapshot, run, old, digest } = inspectPlanReadyCheckpoint(bytes, pin, owner.now);
    if (owner.fence.resource !== "pbos:mission:" + pin.repository + ":" + pin.missionId ||
        owner.fence.fencingToken < 1n || !owner.fence.ownerId || !owner.host || (owner.host === old.host && owner.pid === old.processId) ||
        !Number.isSafeInteger(owner.pid) || owner.pid < 1 || !(owner.expiresAt > owner.now) ||
        owner.expiresAt.getTime() - owner.now.getTime() > 300_000) throw Error("RECOVERY_NEW_LEASE");
    const acquiredAt = owner.now.toISOString();
    const next: ExecutionLease = {
        runId: run.runId, leaseId: randomUUID(), actorId: old.actorId, scope: old.scope, repository: old.repository,
        branch: old.branch, commit: old.commit, processId: owner.pid, host: owner.host, status: "ACTIVE",
        acquiredAt, lastRenewedAt: acquiredAt, expiresAt: owner.expiresAt.toISOString(),
        recoveryMetadata: { previousLeaseId: old.leaseId, previousStateGeneration: pin.stateGeneration,
            previousLockGeneration: pin.lockGeneration, previousStateSha256: digest, ownerId: owner.fence.ownerId,
            fencingToken: owner.fence.fencingToken.toString() }
    };
    return { lease: next, bytes: JSON.stringify({ ...snapshot, executionLeases: [
        ...snapshot.executionLeases.map(lease => lease === old ? { ...old, status: "STALE", releaseMethod: "RECOVERED" } : lease),
        next
    ] }) + "\n" };
}
