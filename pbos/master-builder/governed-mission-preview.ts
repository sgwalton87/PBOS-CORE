import type { MissionQueueItem } from "../production-runtime/contracts";
import { evaluateMasterBuilderMissionBinding, type MasterBuilderMissionBinding,
  type VerifiedMissionAuthorization } from "./mission-binding-gate";
import { previewMasterBuilderMission } from "./mission-selection-preview";
import type { MasterBuilderEvidence } from "./readiness-gate";

export type GovernedMissionPreview = Readonly<{
  status: "CANDIDATE" | "BLOCKED" | "EMPTY";
  candidate: Readonly<Pick<MissionQueueItem, "missionId" | "systemId" | "title">> | null;
  blockers: readonly string[];
  executionAuthorized: false;
}>;

/**
 * Combines the existing canonical queue with read-only mission binding checks.
 * An approval for mission A must never make mission B eligible.
 * This is an observation path, not a runtime entrypoint.
 */
export function previewGovernedMasterBuilderMission(
  items: readonly MissionQueueItem[],
  evidence: MasterBuilderEvidence,
  mission: MasterBuilderMissionBinding,
  approval: VerifiedMissionAuthorization | null,
  now: Date,
): GovernedMissionPreview {
  const bound = evaluateMasterBuilderMissionBinding(evidence, mission, approval, now);
  if (bound.binding !== "MATCHED") {
    return { status: "BLOCKED", candidate: null,
      blockers: [...bound.readiness.blockers, ...bound.bindingBlockers],
      executionAuthorized: false };
  }
  const selected = previewMasterBuilderMission(items, bound.readiness);
  if (selected.status !== "CANDIDATE" || !selected.candidate) return selected;
  if (selected.candidate.missionId !== mission.missionId) {
    return { status: "BLOCKED", candidate: null,
      blockers: ["SELECTED_MISSION_APPROVAL_MISMATCH"], executionAuthorized: false };
  }
  return selected;
}
