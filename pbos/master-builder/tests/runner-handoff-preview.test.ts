import { describe, expect, it, vi } from "vitest";
import type { MissionQueueItem } from "../../production-runtime/contracts";
import type { ProductionMissionRequest } from "../../production-runtime/production-mission-runner";
import { ProductionMissionAdapterRegistry } from "../../production-runtime/mission-adapter-registry";
import type { MasterBuilderEvidence } from "../readiness-gate";
import type { MasterBuilderMissionBinding, VerifiedMissionAuthorization } from "../mission-binding-gate";
import { previewExistingRunnerHandoff } from "../runner-handoff-preview";

const sha = "a".repeat(40);
const now = new Date("2026-11-20T00:00:00Z");
const item: MissionQueueItem = {
  missionId: "m1", systemId: "synthetic", title: "m1", status: "QUEUED",
  dependencies: [], rationale: "", approvalRequired: true, evidenceIds: [],
};
const evidence: MasterBuilderEvidence = {
  genesisIntegrity: "VALID", canonEvidence: "COMPLETE", operatorAuthenticated: true,
  approvalVerified: true, approvalScopedToMission: true, sourceRevisionPinned: true,
  isolatedWorktree: true, syntheticState: true, existingActiveLease: false,
};
const mission: MasterBuilderMissionBinding = {
  missionId: "m1", repository: "test/disposable", sourceSha: sha,
  stateNamespace: "disposable-1", environment: "DISPOSABLE",
};
const approval: VerifiedMissionAuthorization = {
  missionId: "m1", repository: "test/disposable", sourceSha: sha,
  stateNamespace: "disposable-1", expiresAt: "2030-01-01T00:00:00Z",
  verifiedByAuthority: true,
};
const request: ProductionMissionRequest = {
  systemId: "synthetic", actorId: "operator", authorizationArtifactId: "artifact-1",
  repository: "test/disposable", branch: "isolated", commit: sha,
  approvedMissionIds: ["m1"], maximumMissions: 1, autonomousContinuation: false,
  buildChannel: {
    channelId: "disposable-channel", systemId: "synthetic", operatingSystemId: "pbos",
    connectorId: "disposable-connector", repository: "test/disposable",
    domainRegistrationIds: ["disposable-domain"],
  },
};

describe("Master Builder handoff to existing runner", () => {
  const factory = vi.fn(() => async () => ({
    outputs: {}, evidenceIds: [], validations: [],
  }));
  const registry = new ProductionMissionAdapterRegistry().register("synthetic", "m1", factory);
  it("previews matching mission and existing adapter without invoking factory", () => {
    const result = previewExistingRunnerHandoff([item], registry, request, evidence, mission, approval, now);
    expect(result).toEqual({
      status: "READY_FOR_SEPARATE_RUNTIME_AUTHORIZATION", missionId: "m1",
      blockers: [], executionAuthorized: false,
    });
    expect(factory).not.toHaveBeenCalled();
  });
  it("blocks a runner targeting a different commit", () => {
    const result = previewExistingRunnerHandoff([item], registry,
      { ...request, commit: "b".repeat(40) }, evidence, mission, approval, now);
    expect(result.blockers).toContain("RUNNER_MISSION_REVISION_MISMATCH");
  });
  it("blocks a runner targeting a different repository", () => {
    const result = previewExistingRunnerHandoff([item], registry,
      { ...request, repository: "test/other", buildChannel: {
        ...request.buildChannel, repository: "test/other",
      } }, evidence, mission, approval, now);
    expect(result.blockers).toContain("RUNNER_MISSION_REVISION_MISMATCH");
  });
  it("blocks approval for a different mission despite registered adapter", () => {
    const result = previewExistingRunnerHandoff([item], registry, request,
      evidence, { ...mission, missionId: "m2" }, approval, now);
    expect(result.status).toBe("BLOCKED");
    expect(result.missionId).toBeNull();
  });
  it("blocks missing authority verification without calling runner", () => {
    const result = previewExistingRunnerHandoff([item], registry, request,
      evidence, mission, { ...approval, verifiedByAuthority: false }, now);
    expect(result.blockers).toContain("RUNNER_APPROVAL_NOT_INDEPENDENTLY_VERIFIED");
  });
  it("blocks an unregistered executor and active lease", () => {
    const result = previewExistingRunnerHandoff([item], new ProductionMissionAdapterRegistry(),
      request, { ...evidence, existingActiveLease: true }, mission, approval, now);
    expect(result.blockers).toContain("ACTIVE_LEASE_PRESENT");
    expect(result.blockers).toContain("NO_EXISTING_EXECUTION_ADAPTER");
  });
});
