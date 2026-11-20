import type { VerifiableApproval } from "../genesis-state/operator-identity";
import type { MissionQueueItem } from "../production-runtime/contracts";
import { ProductionMissionRunner, type ProductionMissionExecutor, type ProductionMissionRequest, type ProductionMissionSequence } from "../production-runtime/production-mission-runner";
import type { MasterBuilderMissionBinding } from "./mission-binding-gate";
import { inspectScopedDisposableMissionApproval, type ExistingApprovalVerifier } from "./signed-approval-evidence";

/**
 * Fail-closed, opt-in MB-02 boundary around the EXISTING runner. This wrapper
 * never creates another queue, runtime, state store or execution authority.
 * Do not expose an unverified ProductionMissionRequest to this entry point.
 */
export async function runAuthorizedDisposableMission(
  runner: Pick<ProductionMissionRunner, "run">,
  verifier: ExistingApprovalVerifier,
  approval: VerifiableApproval | null,
  mission: MasterBuilderMissionBinding,
  request: ProductionMissionRequest,
  executorFor: (candidate: MissionQueueItem) => ProductionMissionExecutor | undefined,
  now: Date,
): Promise<ProductionMissionSequence> {
  if (mission.environment !== "DISPOSABLE" ||
      request.repository !== mission.repository || request.commit !== mission.sourceSha ||
      request.authorizationArtifactId !== approval?.approvalId ||
      request.actorId !== approval?.operatorId ||
      request.approvedMissionIds?.length !== 1 ||
      request.approvedMissionIds[0] !== mission.missionId ||
      request.maximumMissions !== 1 || request.autonomousContinuation !== false ||
      request.triggerSource === "CONTINUATION" ||
      !request.branch.startsWith("disposable/") ||
      request.buildChannel.repository !== mission.repository) {
    throw new Error("Master Builder disposable mission runner request violates exact approval boundary.");
  }
  const verified = inspectScopedDisposableMissionApproval(verifier, approval, mission, now);
  if (!verified?.verifiedByAuthority || verified.expiresAt <= now.toISOString()) {
    throw new Error("Master Builder disposable mission requires valid scoped operator signature.");
  }
  return runner.run(request, candidate => candidate.missionId === mission.missionId
    ? executorFor(candidate) : undefined);
}
