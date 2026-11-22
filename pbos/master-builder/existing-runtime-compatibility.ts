import type { MissionQueueItem } from "../production-runtime/contracts";
import { ProductionMissionAdapterRegistry } from "../production-runtime/mission-adapter-registry";
import type { ProductionMissionRequest } from "../production-runtime/production-mission-runner";
import type { GovernedMissionPreview } from "./governed-mission-preview";

export type MasterBuilderRuntimeCompatibility = Readonly<{
  status: "READY_FOR_EXISTING_RUNNER" | "BLOCKED";
  blockers: readonly string[];
  executionAuthorized: false;
}>;

/**
 * Compatibility preflight ONLY. Existing ProductionMissionRunner owns
 * execution, ProductionRuntimeService owns leases/events, and
 * AutonomousProductionKernel owns functional acceptance.
 *
 * Do not call registry.resolve() here: it invokes a factory. coverage()
 * inspects registrations without constructing an executor.
 */
export function inspectExistingRuntimeCompatibility(
  preview: GovernedMissionPreview,
  missions: readonly MissionQueueItem[],
  registry: ProductionMissionAdapterRegistry,
  request: ProductionMissionRequest,
): MasterBuilderRuntimeCompatibility {
  const blockers: string[] = [];
  if (preview.status !== "CANDIDATE" || !preview.candidate) {
    blockers.push("NO_GOVERNED_CANDIDATE");
  }
  const candidate = preview.candidate &&
    missions.find(item => item.missionId === preview.candidate?.missionId &&
      item.systemId === preview.candidate.systemId);
  if (preview.candidate && !candidate) blockers.push("CANDIDATE_NOT_IN_QUEUE");
  if (candidate && registry.coverage([candidate]).missing.length > 0) {
    blockers.push("NO_EXISTING_EXECUTION_ADAPTER");
  }
  if (candidate && candidate.systemId !== request.systemId) blockers.push("SYSTEM_MISMATCH");
  if (candidate && candidate.approvalRequired &&
      !(request.approvedMissionIds ?? []).includes(candidate.missionId)) {
    blockers.push("RUNNER_APPROVAL_LIST_MISSING");
  }
  if (!request.authorizationArtifactId.trim()) blockers.push("RUNNER_AUTHORIZATION_MISSING");
  if (!/^[a-f0-9]{7,40}$/i.test(request.commit) || !request.repository.includes("/")) {
    blockers.push("RUNNER_REPOSITORY_LINEAGE_INVALID");
  }
  if (!request.buildChannel.channelId || !request.buildChannel.operatingSystemId ||
      !request.buildChannel.connectorId || !request.buildChannel.domainRegistrationIds.length ||
      request.buildChannel.systemId !== request.systemId ||
      request.buildChannel.repository !== request.repository) {
    blockers.push("RUNNER_BUILD_CHANNEL_MISMATCH");
  }
  if (request.maximumMissions !== 1 || request.autonomousContinuation !== false) {
    blockers.push("DISPOSABLE_REHEARSAL_NOT_BOUNDED");
  }
  return {
    status: blockers.length === 0 ? "READY_FOR_EXISTING_RUNNER" : "BLOCKED",
    blockers, executionAuthorized: false,
  };
}
