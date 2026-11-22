import { describe, expect, it } from "vitest";
import {
  evaluateMasterBuilderReadiness,
  type MasterBuilderEvidence,
} from "../readiness-gate";

const safe: MasterBuilderEvidence = {
  genesisIntegrity: "VALID",
  canonEvidence: "COMPLETE",
  operatorAuthenticated: true,
  approvalVerified: true,
  approvalScopedToMission: true,
  sourceRevisionPinned: true,
  isolatedWorktree: true,
  syntheticState: true,
  existingActiveLease: false,
};

describe("Master Builder MB-01 read-only readiness", () => {
  it("reports eligibility without granting execution authority", () => {
    expect(evaluateMasterBuilderReadiness(safe)).toEqual({
      decision: "ELIGIBLE_FOR_SEPARATE_AUTHORIZATION",
      blockers: [],
      executionAuthorized: false,
    });
  });

  it.each([
    ["genesisIntegrity", "INVALID", "GENESIS_INVALID"],
    ["genesisIntegrity", "UNKNOWN", "GENESIS_UNVERIFIED"],
    ["canonEvidence", "BLOCKED", "CANON_BLOCKED"],
    ["canonEvidence", "UNKNOWN", "CANON_UNVERIFIED"],
    ["operatorAuthenticated", false, "OPERATOR_UNAUTHENTICATED"],
    ["approvalVerified", false, "APPROVAL_UNVERIFIED"],
    ["approvalScopedToMission", false, "APPROVAL_OUT_OF_SCOPE"],
    ["sourceRevisionPinned", false, "SOURCE_REVISION_UNPINNED"],
    ["isolatedWorktree", false, "WORKTREE_NOT_ISOLATED"],
    ["syntheticState", false, "STATE_NOT_SYNTHETIC"],
    ["existingActiveLease", true, "ACTIVE_LEASE_PRESENT"],
  ] as const)("blocks unsafe evidence %s=%s", (key, value, blocker) => {
    const result = evaluateMasterBuilderReadiness({ ...safe, [key]: value });
    expect(result.decision).toBe("BLOCKED");
    expect(result.blockers).toContain(blocker);
    expect(result.executionAuthorized).toBe(false);
  });

  it("returns all blockers in stable order and never mutates its input", () => {
    const evidence = Object.freeze({
      ...safe,
      genesisIntegrity: "INVALID" as const,
      canonEvidence: "BLOCKED" as const,
      approvalVerified: false,
      syntheticState: false,
    });
    const snapshot = JSON.stringify(evidence);
    expect(evaluateMasterBuilderReadiness(evidence)).toEqual({
      decision: "BLOCKED",
      blockers: ["GENESIS_INVALID", "CANON_BLOCKED", "APPROVAL_UNVERIFIED", "STATE_NOT_SYNTHETIC"],
      executionAuthorized: false,
    });
    expect(JSON.stringify(evidence)).toBe(snapshot);
  });
});
