import type { MissionQueueItem } from "../production-runtime/contracts";
import { ProductionMissionAdapterRegistry } from "../production-runtime/mission-adapter-registry";
import type { ProductionMissionRequest } from "../production-runtime/production-mission-runner";
import { previewGovernedMasterBuilderMission } from "./governed-mission-preview";
import { inspectExistingRuntimeCompatibility } from "./existing-runtime-compatibility";
import type { MasterBuilderEvidence } from "./readiness-gate";
import type { MasterBuilderMissionBinding, VerifiedMissionAuthorization } from "./mission-binding-gate";

export type RunnerHandoffPreview = Readonly<{
  status: "READY_FOR_SEPARATE_RUNTIME_AUTHORIZATION" | "BLOCKED";
  missionId: string | null;
  blockers: readonly string[];
  executionAuthorized: false;
}>;

/**
 * The Master Builder is an observer of the EXISTING autonomous stack.
 * This handoff preview cannot call the runner, resolve adapter factories,
 * acquire leases, write Genesis, or verify signatures by itself.
 */
export function previewExistingRunnerHandoff(
  missions: readonly MissionQueueItem[],
  registry: ProductionMissionAdapterRegistry,
  request: ProductionMissionRequest,
  evidence: MasterBuilderEvidence,
  mission: MasterBuilderMissionBinding,
  approval: VerifiedMissionAuthorization | null,
  now: Date,
): RunnerHandoffPreview {
  const selection = previewGovernedMasterBuilderMission(missions, evidence, mission, approval, now);
  const compatibility = inspectExistingRuntimeCompatibility(selection, missions, registry, request);
  const blockers = [...selection.blockers, ...compatibility.blockers];

  if (request.repository !== mission.repository || request.commit !== mission.sourceSha) {
    blockers.push("RUNNER_MISSION_REVISION_MISMATCH");
  }
  if (selection.candidate?.missionId !== mission.missionId ||
      selection.candidate?.systemId !== request.systemId) {
    blockers.push("RUNNER_SELECTED_MISSION_MISMATCH");
  }
  // Do not infer that an approval identifier was cryptographically verified.
  if (!approval?.verifiedByAuthority || !evidence.approvalVerified ||
      !evidence.approvalScopedToMission) {
    blockers.push("RUNNER_APPROVAL_NOT_INDEPENDENTLY_VERIFIED");
  }
  return {
    status: blockers.length ? "BLOCKED" : "READY_FOR_SEPARATE_RUNTIME_AUTHORIZATION",
    missionId: blockers.length ? null : mission.missionId,
    blockers: [...new Set(blockers)],
    executionAuthorized: false,
  };
}
