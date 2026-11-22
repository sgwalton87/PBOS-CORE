import type { CanonPhaseImplementationAgent, CanonPhaseImplementationRequest } from "../application-readiness/playbook-canon-phase-executor";
import { attestDisposableWorktree } from "./disposable-worktree-proof";
import { inspectDisposableWorkerChanges, type DisposableChangeInspection } from "./disposable-change-boundary";
import type { VerifiableApproval } from "../genesis-state/operator-identity";
import type { MasterBuilderMissionBinding } from "./mission-binding-gate";
import { inspectScopedDisposableMissionApproval, type ExistingApprovalVerifier } from "./signed-approval-evidence";

/**
 * MB-02 bounded handoff to the EXISTING Codex implementation agent.
 * This is a worker admission boundary, not proof of functional acceptance.
 * The caller must provision an isolated disposable worktree independently.
 */
export async function executeAuthorizedDisposableWorker(
  agent: CanonPhaseImplementationAgent,
  verifier: ExistingApprovalVerifier,
  approval: VerifiableApproval | null,
  mission: MasterBuilderMissionBinding,
  request: CanonPhaseImplementationRequest,
  worktree: Readonly<{ path: string; repository: string; sourceSha: string; isolated: boolean; disposable: boolean }>,
  now: Date,
): Promise<Readonly<{ summary: string }>> {
  if (mission.environment !== "DISPOSABLE" || !worktree.isolated || !worktree.disposable ||
      !worktree.path || worktree.path === "/" ||
      request.workingDirectory !== worktree.path ||
      request.repository !== mission.repository || request.revision !== mission.sourceSha ||
      worktree.repository !== mission.repository || worktree.sourceSha !== mission.sourceSha ||
      request.missionId !== mission.missionId) {
    throw new Error("Master Builder worker requires an exact-revision isolated disposable worktree.");
  }
  if (!inspectScopedDisposableMissionApproval(verifier, approval, mission, now)) {
    throw new Error("Master Builder worker requires a valid mission-scoped signed approval.");
  }
  await attestDisposableWorktree(worktree.path, mission.repository, mission.sourceSha);
  return agent.execute(request);
}

/**
 * MB-02 governed worker cycle: a successful worker response is NOT accepted
 * until the actual disposable worktree diff passes the mission path boundary.
 * No commit, PR, merge, deployment, or approval is performed here.
 */
export async function executeAndInspectAuthorizedDisposableWorker(
  agent: CanonPhaseImplementationAgent,
  verifier: ExistingApprovalVerifier,
  approval: VerifiableApproval | null,
  mission: MasterBuilderMissionBinding,
  request: CanonPhaseImplementationRequest,
  worktree: Readonly<{ path: string; repository: string; sourceSha: string; isolated: boolean; disposable: boolean }>,
  allowedPaths: readonly string[],
  now: Date,
): Promise<Readonly<{ summary: string; inspection: DisposableChangeInspection }>> {
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0 ||
      allowedPaths.some(path => typeof path !== "string" || !path.trim())) {
    throw new Error("Master Builder worker requires a nonempty mission change scope.");
  }
  const result = await executeAuthorizedDisposableWorker(
    agent, verifier, approval, mission, request, worktree, now);
  const inspection = await inspectDisposableWorkerChanges(
    worktree.path, mission.repository, mission.sourceSha, allowedPaths);
  if (!inspection.accepted) {
    throw new Error(`Master Builder worker changes failed mission scope: ${inspection.blockers.join("; ")}`);
  }
  return { summary: result.summary, inspection };
}
