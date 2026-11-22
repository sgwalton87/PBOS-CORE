import { describe, expect, it } from "vitest";
import type { MissionQueueItem } from "../../production-runtime/contracts";
import { previewGovernedMasterBuilderMission } from "../governed-mission-preview";
import type { MasterBuilderEvidence } from "../readiness-gate";
import type { MasterBuilderMissionBinding, VerifiedMissionAuthorization } from "../mission-binding-gate";

const sha = "a".repeat(40);
const now = new Date("2026-11-20T00:00:00Z");
const evidence: MasterBuilderEvidence = {
  genesisIntegrity: "VALID", canonEvidence: "COMPLETE",
  operatorAuthenticated: true, approvalVerified: true,
  approvalScopedToMission: true, sourceRevisionPinned: true,
  isolatedWorktree: true, syntheticState: true, existingActiveLease: false,
};
const mission: MasterBuilderMissionBinding = {
  missionId: "mission-1", repository: "test/disposable", sourceSha: sha,
  stateNamespace: "test-state", environment: "DISPOSABLE",
};
const approval: VerifiedMissionAuthorization = {
  missionId: mission.missionId, repository: mission.repository,
  sourceSha: mission.sourceSha, stateNamespace: mission.stateNamespace,
  expiresAt: "2030-01-01T00:00:00Z", verifiedByAuthority: true,
};
const item = (id: string): MissionQueueItem => ({
  missionId: id, systemId: "synthetic", title: id, dependencies: [],
  status: "QUEUED", rationale: "", approvalRequired: true, evidenceIds: [],
});

describe("Master Builder governed mission preview", () => {
  it("previews the selected and bound mission without authorizing execution", () => {
    expect(previewGovernedMasterBuilderMission([item("mission-1")],
      evidence, mission, approval, now)).toEqual({
      status: "CANDIDATE",
      candidate: { missionId: "mission-1", systemId: "synthetic", title: "mission-1" },
      blockers: [], executionAuthorized: false,
    });
  });
  it("blocks when queue selects a different mission than the verified approval", () => {
    const result = previewGovernedMasterBuilderMission(
      [item("mission-2"), item("mission-1")], evidence, mission, approval, now);
    expect(result).toMatchObject({
      status: "BLOCKED", candidate: null,
      blockers: ["SELECTED_MISSION_APPROVAL_MISMATCH"], executionAuthorized: false,
    });
  });
  it("blocks a matching mission with an expired approval", () => {
    const result = previewGovernedMasterBuilderMission([item("mission-1")],
      evidence, mission, { ...approval, expiresAt: "2020-01-01T00:00:00Z" }, now);
    expect(result.blockers).toContain("APPROVAL_EXPIRED_OR_INVALID");
    expect(result.candidate).toBeNull();
  });
  it("blocks corrupted Genesis before selecting a mission", () => {
    const result = previewGovernedMasterBuilderMission([item("mission-1")],
      { ...evidence, genesisIntegrity: "INVALID" }, mission, approval, now);
    expect(result.blockers).toContain("GENESIS_INVALID");
  });
  it("blocks unverified approval even when mission identity matches", () => {
    const result = previewGovernedMasterBuilderMission([item("mission-1")],
      evidence, mission, { ...approval, verifiedByAuthority: false }, now);
    expect(result.blockers).toContain("AUTHORITY_VERIFICATION_MISSING");
  });
  it("never creates a candidate for an empty queue", () => {
    expect(previewGovernedMasterBuilderMission([], evidence, mission, approval, now)
      .status).toBe("EMPTY");
  });
});
