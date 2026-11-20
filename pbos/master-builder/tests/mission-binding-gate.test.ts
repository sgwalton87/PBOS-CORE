import { describe, expect, it } from "vitest";
import type { MasterBuilderEvidence } from "../readiness-gate";
import {
  evaluateMasterBuilderMissionBinding,
  type MasterBuilderMissionBinding,
  type VerifiedMissionAuthorization,
} from "../mission-binding-gate";

const sha = "a".repeat(40);
const evidence: MasterBuilderEvidence = {
  genesisIntegrity: "VALID", canonEvidence: "COMPLETE",
  operatorAuthenticated: true, approvalVerified: true,
  approvalScopedToMission: true, sourceRevisionPinned: true,
  isolatedWorktree: true, syntheticState: true, existingActiveLease: false,
};
const mission: MasterBuilderMissionBinding = {
  missionId: "synthetic-mission-1", repository: "example/disposable",
  sourceSha: sha, stateNamespace: "disposable-123", environment: "DISPOSABLE",
};
const approval: VerifiedMissionAuthorization = {
  missionId: mission.missionId, repository: mission.repository,
  sourceSha: mission.sourceSha, stateNamespace: mission.stateNamespace,
  expiresAt: "2030-01-01T00:00:00Z", verifiedByAuthority: true,
};
const now = new Date("2026-11-20T00:00:00Z");

describe("Master Builder mission binding", () => {
  it("matches a verified disposable mission but never grants execution", () => {
    expect(evaluateMasterBuilderMissionBinding(evidence, mission, approval, now)).toMatchObject({
      binding: "MATCHED", bindingBlockers: [], executionAuthorized: false,
    });
  });
  it.each([
    ["missionId", "different", "APPROVAL_MISSION_MISMATCH"],
    ["repository", "different/repo", "APPROVAL_MISSION_MISMATCH"],
    ["sourceSha", "b".repeat(40), "APPROVAL_MISSION_MISMATCH"],
    ["stateNamespace", "other", "APPROVAL_MISSION_MISMATCH"],
    ["verifiedByAuthority", false, "AUTHORITY_VERIFICATION_MISSING"],
    ["expiresAt", "2020-01-01T00:00:00Z", "APPROVAL_EXPIRED_OR_INVALID"],
    ["expiresAt", "not-a-date", "APPROVAL_EXPIRED_OR_INVALID"],
  ] as const)("rejects approval mismatch %s", (key, value, blocker) => {
    const result = evaluateMasterBuilderMissionBinding(evidence, mission, { ...approval, [key]: value }, now);
    expect(result.binding).toBe("BLOCKED");
    expect(result.bindingBlockers).toContain(blocker);
  });
  it("rejects missing approval and production/staging environments", () => {
    expect(evaluateMasterBuilderMissionBinding(evidence, mission, null, now).binding).toBe("BLOCKED");
    for (const environment of ["PRODUCTION", "STAGING"] as const) {
      expect(evaluateMasterBuilderMissionBinding(evidence, { ...mission, environment }, approval, now)
        .bindingBlockers).toContain("ENVIRONMENT_NOT_DISPOSABLE");
    }
  });
  it("rejects invalid source SHAs and missing mission identifiers", () => {
    expect(evaluateMasterBuilderMissionBinding(evidence, { ...mission, sourceSha: "abc", missionId: "" }, approval, now)
      .bindingBlockers).toContain("MISSION_IDENTITY_INVALID");
  });
  it("rejects a valid binding if Genesis is corrupt", () => {
    const result = evaluateMasterBuilderMissionBinding({ ...evidence, genesisIntegrity: "INVALID" }, mission, approval, now);
    expect(result.binding).toBe("BLOCKED");
    expect(result.readiness.blockers).toContain("GENESIS_INVALID");
  });
});
