import { inspectPlanReadyCheckpoint, preparePlanReadyLeaseHandoff, type PlanReadyHandoff } from "./plan-ready-lease-handoff";
import { hostname } from "node:os";
import type { HostedExecutionLease } from "./hosted-approved-mission";
import type { NeonLeaseSql } from "./neon-fenced-lease-provider";
import type { GcsRemoteDispatchJournal } from "../master-builder/remote-dispatch-journal";

// Issue #95, observation 7173147239. These pins identify the interrupted
// disposable run. A changed generation requires a new reconciliation.
export const interruptedPlan = Object.freeze({
    runId: "f634c6a2-57ca-41f2-8f02-1975ac8f7ef2", missionId: "MB03-MISSION-001",
    repository: "sgwalton87/playbook-platform", commit: "b2c2259d67f30ca068f32cd1889542991f294e42",
    nonce: "6ce074d6-b49d-4d25-bcfb-ce13864556bf", scopeDigest: "f769eb4e2dc40d6204041e911ddfa4054491d38573ecfb70f23256234ab17d4d",
    oldLeaseId: "a68c42ff-1fb1-4ef0-8bda-9a2de7a28863", stateGeneration: "1795592163288446",
    lockGeneration: "1795592163888106", stateSha256: "af20df38688ae221e41e7c1d3c4124933dd41dc84238cdfcb2a3a722fa8789b0"
} satisfies PlanReadyHandoff);

const job = "pbos-mb03-playbook-codex";
const execution = `projects/pbos-genesis-staging/locations/us-west1/jobs/${job}/executions/${job}-2bffn`;
const originalExecution = { name: execution, uid: "df196491-571b-4f36-a68e-d960c4f990f4" };
export const reviewedRecovery = Object.freeze({ pin: interruptedPlan, execution: Object.freeze(originalExecution) });
type ReviewedRecovery = { readonly pin: PlanReadyHandoff; readonly execution: { readonly name: string; readonly uid: string } };

interface RecoveryReads {
    accessToken: (signal: AbortSignal) => Promise<string>;
    readPinnedPair: (pin: PlanReadyHandoff) => Promise<{ generation: string; bytes: string }>;
    journal: Pick<GcsRemoteDispatchJournal, "assertUnreserved">;
    db: NeonLeaseSql;
    http?: typeof fetch;
}

async function observe(deps: RecoveryReads, review: ReviewedRecovery, fence?: HostedExecutionLease) {
    const { pin, execution } = review;
    if (!/^projects\/pbos-genesis-staging\/locations\/us-west1\/jobs\/pbos-mb03-playbook-codex\/executions\/pbos-mb03-playbook-codex-[a-z0-9]+$/.test(execution.name)) {
        throw Error("RECOVERY_EXECUTION_BINDING");
    }
    const signal = AbortSignal.timeout(15_000);
    const url = new URL("https://run.googleapis.com/v2/" + execution.name);
    url.searchParams.set("fields", "name,uid,job,completionTime,conditions(type,state),reconciling,taskCount,runningCount,failedCount");
    const token = await deps.accessToken(signal);
    const response = await (deps.http ?? fetch)(url, { method: "GET", redirect: "error",
        headers: { authorization: "Bearer " + token }, signal });
    if (!response.ok) {
        await response.body?.cancel();
        throw Error("RECOVERY_EXECUTION_HTTP_" + response.status);
    }
    const body = await response.json();
    if (!body || typeof body !== "object") throw Error("RECOVERY_EXECUTION_NOT_TERMINAL");
    const record = body as Record<string, unknown>;
    const completed = Array.isArray(record.conditions) && record.conditions.filter(
        (c: { type: string }) => c?.type === "Completed");
    if (record.name !== execution.name || record.uid !== execution.uid || record.job !== job ||
        typeof record.completionTime !== "string" || !Number.isFinite(Date.parse(record.completionTime)) ||
        (record.reconciling !== undefined && record.reconciling !== false) ||
        record.taskCount !== 1 || record.failedCount !== 1 || (record.runningCount !== undefined && record.runningCount !== 0) ||
        !completed || completed.length !== 1 || completed[0].state !== "CONDITION_FAILED") {
        throw Error("RECOVERY_EXECUTION_NOT_TERMINAL");
    }
    await deps.journal.assertUnreserved(pin.repository, pin.missionId, signal);
    // Check the checkpoint's actual unique key (mission_id), including conflicting repository lineage.
    const state = await deps.readPinnedPair(pin);
    if (state.generation !== pin.stateGeneration) throw Error("RECOVERY_STATE_PIN");
    const resource = "pbos:mission:" + pin.repository + ":" + pin.missionId;
    if (fence && fence.resource !== resource) throw Error("RECOVERY_FENCE_RESOURCE");
    // Use a single database snapshot. The preflight needs no live fence; preparation
    // must observe the caller's precise, unexpired database fence.
    const fenceCheck = fence
        ? "EXISTS(SELECT 1 FROM pbos_runner.execution_lease WHERE resource=$3 AND owner_id=$4::uuid AND fencing_token=$5::bigint AND expires_at>clock_timestamp())"
        : "NOT EXISTS(SELECT 1 FROM pbos_runner.execution_lease WHERE resource=$3 AND expires_at>=clock_timestamp())";
    const args = [pin.nonce, pin.missionId, resource];
    if (fence) args.push(fence.ownerId, fence.fencingToken.toString());
    // The executor can read only the unique nonce column. The pinned state binds that nonce to this mission.
    const result = await deps.db.query<{ consumed: boolean; checkpoint_absent: boolean; fence_matches: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM pbos_runner.mission_approval_nonce WHERE nonce=$1::uuid) AS consumed,
         NOT EXISTS(SELECT 1 FROM pbos_runner.mission_checkpoint WHERE mission_id=$2) AS checkpoint_absent,
         ${fenceCheck} AS fence_matches`, args);
    if (result.rows.length !== 1 || result.rows[0].consumed !== true ||
        result.rows[0].checkpoint_absent !== true || result.rows[0].fence_matches !== true) {
        throw Error("RECOVERY_NEON_LINEAGE");
    }
    return state;
}

export async function inspectHostedPlanReady(deps: RecoveryReads, review: ReviewedRecovery = reviewedRecovery) {
    const { pin } = review;
    const state = await observe(deps, review);
    inspectPlanReadyCheckpoint(state.bytes, pin, new Date());
    return { status: "PLAN_READY_CHECKPOINT_OBSERVED", runId: pin.runId, previousExecution: review.execution.name,
        stateGeneration: state.generation, lockGeneration: pin.lockGeneration, stateSha256: pin.stateSha256,
        missionExecutionAuthorized: false, leaseAcquired: false };
}

// Called by the process holding the fence. The candidate is private to that
// process; its lifetime cannot be extended by a preflight receipt.
export async function prepareHostedPlanReadyHandoff(deps: RecoveryReads, fence: HostedExecutionLease,
    review: ReviewedRecovery = reviewedRecovery) {
    const { pin } = review;
    const state = await observe(deps, review, fence);
    const now = new Date();
    return preparePlanReadyLeaseHandoff(state.bytes, pin, {
        host: hostname(), pid: process.pid, now, expiresAt: new Date(now.getTime() + 30_000), fence
    }, { terminatedController: true, journal: "absent", checkpointCount: 0, consumedNonce: pin.nonce, fenceCurrent: true });
}
