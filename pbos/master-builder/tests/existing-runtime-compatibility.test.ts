import { describe, expect, it, vi } from "vitest";
import { ProductionMissionAdapterRegistry } from "../../production-runtime/mission-adapter-registry";
import type { MissionQueueItem } from "../../production-runtime/contracts";
import type { ProductionMissionRequest } from "../../production-runtime/production-mission-runner";
import { inspectExistingRuntimeCompatibility } from "../existing-runtime-compatibility";
import type { GovernedMissionPreview } from "../governed-mission-preview";

const item: MissionQueueItem = {
  missionId: "mission-1", systemId: "synthetic", title: "mission-1",
  dependencies: [], status: "ELIGIBLE", rationale: "", approvalRequired: true, evidenceIds: [],
};
const preview: GovernedMissionPreview = {
  status: "CANDIDATE", candidate: { missionId: item.missionId, systemId: item.systemId, title: item.title },
  blockers: [], executionAuthorized: false,
};
const request: ProductionMissionRequest = {
  systemId: "synthetic", actorId: "operator", authorizationArtifactId: "verified-by-authority-elsewhere",
  repository: "example/disposable", branch: "isolated", commit: "a".repeat(40),
  approvedMissionIds: ["mission-1"], maximumMissions: 1, autonomousContinuation: false,
  buildChannel: {
    channelId: "test-channel", systemId: "synthetic", operatingSystemId: "pbos",
    connectorId: "test-connector", repository: "example/disposable",
    domainRegistrationIds: ["test-domain"],
  },
};

describe("Master Builder existing runtime compatibility", () => {
  it("uses registry coverage without constructing an executor", () => {
    const factory = vi.fn(() => async () => ({
      outputs: {}, evidenceIds: [], validations: [],
    }));
    const registry = new ProductionMissionAdapterRegistry().register("synthetic", "mission-1", factory);
    const result = inspectExistingRuntimeCompatibility(preview, [item], registry, request);
    expect(result).toEqual({ status: "READY_FOR_EXISTING_RUNNER",
      blockers: [], executionAuthorized: false });
    expect(factory).not.toHaveBeenCalled();
  });
  it("rejects a mission without an existing adapter", () => {
    expect(inspectExistingRuntimeCompatibility(preview, [item],
      new ProductionMissionAdapterRegistry(), request).blockers)
      .toContain("NO_EXISTING_EXECUTION_ADAPTER");
  });
  it("rejects missing runner approval and build channel", () => {
    const registry = new ProductionMissionAdapterRegistry().register("synthetic", "mission-1", () => async () => ({
      outputs: {}, evidenceIds: [], validations: [],
    }));
    const result = inspectExistingRuntimeCompatibility(preview, [item], registry, {
      ...request, approvedMissionIds: [],
      buildChannel: { ...request.buildChannel, connectorId: "" },
    });
    expect(result.blockers).toContain("RUNNER_APPROVAL_LIST_MISSING");
    expect(result.blockers).toContain("RUNNER_BUILD_CHANNEL_MISMATCH");
  });
  it("rejects continuation beyond a single disposable rehearsal", () => {
    const result = inspectExistingRuntimeCompatibility(preview, [item],
      new ProductionMissionAdapterRegistry(), { ...request, maximumMissions: 10, autonomousContinuation: true });
    expect(result.blockers).toContain("DISPOSABLE_REHEARSAL_NOT_BOUNDED");
  });
  it("rejects missing candidate without accessing runtime", () => {
    expect(inspectExistingRuntimeCompatibility({
      status: "BLOCKED", candidate: null, blockers: ["GENESIS_INVALID"], executionAuthorized: false,
    }, [], new ProductionMissionAdapterRegistry(), request).status).toBe("BLOCKED");
  });
});
