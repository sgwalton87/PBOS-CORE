import { GovernedMissionQueue } from "../production-runtime/mission-queue";
import type { MissionQueueItem } from "../production-runtime/contracts";
import type { MasterBuilderReadiness } from "./readiness-gate";

export type MissionSelectionPreview = Readonly<{
  status: "CANDIDATE" | "BLOCKED" | "EMPTY";
  candidate: Readonly<Pick<MissionQueueItem, "missionId" | "systemId" | "title">> | null;
  blockers: readonly string[];
  executionAuthorized: false;
}>;

/**
 * Read-only mission preview using the existing canonical queue semantics.
 * This does not acquire a lease, authorize, persist, or execute anything.
 */
export function previewMasterBuilderMission(
  items: readonly MissionQueueItem[],
  readiness: MasterBuilderReadiness,
): MissionSelectionPreview {
  if (readiness.decision !== "ELIGIBLE_FOR_SEPARATE_AUTHORIZATION") {
    return { status: "BLOCKED", candidate: null, blockers: [...readiness.blockers],
      executionAuthorized: false };
  }
  try {
    const queue = new GovernedMissionQueue();
    // next() intentionally returns undefined when any active mission or
    // execution blocker is present, preserving the existing queue's stop rule.
    const candidate = queue.next(items);
    if (!candidate) {
      const blocked = items.some(item => item.status === "ACTIVE" || Boolean(item.executionBlocker));
      return { status: blocked ? "BLOCKED" : "EMPTY", candidate: null,
        blockers: blocked ? ["QUEUE_ACTIVE_OR_EXECUTION_BLOCKED"] : ["NO_ELIGIBLE_MISSION"],
        executionAuthorized: false };
    }
    return { status: "CANDIDATE",
      candidate: { missionId: candidate.missionId, systemId: candidate.systemId, title: candidate.title },
      blockers: [], executionAuthorized: false };
  } catch {
    // Do not disclose queue contents or identifiers from malformed state.
    return { status: "BLOCKED", candidate: null, blockers: ["QUEUE_INVALID"],
      executionAuthorized: false };
  }
}
