import { describe, expect, it } from "vitest";
import type { OperatorPreflightReport } from "../../production-runtime/operator-readonly-preflight";
import {
  evaluateOperatorMissionReadiness,
  type ExternalMissionEvidence,
} from "../operator-evidence-adapter";

const inspected: OperatorPreflightReport = {
  status: "INSPECTED",
  missingFiles: [],
  operatorAuthenticated: true,
  integrityValid: true,
  runtimeHealth: "HEALTHY",
  activeRuns: 0,
  activeLeases: 0,
  queuedMissions: 1,
  stateFingerprint: "test-digest",
  stateFilesUnchanged: true,
  approvalGranted: false,
};

const external: ExternalMissionEvidence = {
  canonEvidence: "COMPLETE",
  approvalVerified: true,
  approvalScopedToMission: true,
  sourceRevisionPinned: true,
  isolatedWorktree: true,
  syntheticState: true,
};

describe("Master Builder operator evidence adapter", () => {
  it("does not confuse preflight observation with authorization", () => {
    const result = evaluateOperatorMissionReadiness(inspected, external);
    expect(result.decision).toBe("ELIGIBLE_FOR_SEPARATE_AUTHORIZATION");
    expect(result.executionAuthorized).toBe(false);
  });

  it("blocks known Genesis corruption even if an operator authenticated", () => {
    const result = evaluateOperatorMissionReadiness({
      ...inspected, status: "BLOCKED", integrityValid: false,
    }, external);
    expect(result.blockers).toContain("GENESIS_INVALID");
    expect(result.blockers).toContain("OPERATOR_UNAUTHENTICATED");
  });

  it("blocks missing integrity and unknown lease evidence", () => {
    const result = evaluateOperatorMissionReadiness({
      ...inspected, status: "BLOCKED", integrityValid: null,
      activeLeases: null, activeRuns: null,
    }, external);
    expect(result.blockers).toContain("GENESIS_UNVERIFIED");
    expect(result.blockers).toContain("ACTIVE_LEASE_PRESENT");
  });

  it("blocks changed state fingerprints", () => {
    const result = evaluateOperatorMissionReadiness({
      ...inspected, stateFilesUnchanged: false,
    }, external);
    expect(result.blockers).toContain("GENESIS_UNVERIFIED");
  });

  it("does not manufacture approvals or Canon readiness", () => {
    const result = evaluateOperatorMissionReadiness(inspected, {
      ...external, approvalVerified: false, canonEvidence: "UNKNOWN",
    });
    expect(result.blockers).toContain("APPROVAL_UNVERIFIED");
    expect(result.blockers).toContain("CANON_UNVERIFIED");
  });

  it("blocks any active run or lease", () => {
    expect(evaluateOperatorMissionReadiness({
      ...inspected, activeRuns: 1,
    }, external).blockers).toContain("ACTIVE_LEASE_PRESENT");
    expect(evaluateOperatorMissionReadiness({
      ...inspected, activeLeases: 1,
    }, external).blockers).toContain("ACTIVE_LEASE_PRESENT");
  });
});
