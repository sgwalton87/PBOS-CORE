import { describe, expect, it, vi } from "vitest";
import type { VerifiableApproval } from "../../genesis-state/operator-identity";
import { inspectSignedMissionApproval } from "../signed-approval-evidence";
import type { MasterBuilderMissionBinding } from "../mission-binding-gate";

const now = new Date("2026-11-20T00:00:00Z");
const mission: MasterBuilderMissionBinding = {
  missionId: "synthetic-1", repository: "test/disposable",
  sourceSha: "a".repeat(40), stateNamespace: "disposable-state", environment: "DISPOSABLE",
};
const approval: VerifiableApproval = {
  approvalId: "approval-1", operatorId: "operator", organizationId: "org",
  action: "existing:mission", resource: "synthetic-1", issuedAt: "2026-11-19T00:00:00Z",
  expiresAt: "2026-11-21T00:00:00Z", signature: "signature",
};
const context = { action: "existing:mission", resource: "synthetic-1", mission };

describe("Master Builder existing signed-approval verifier adapter", () => {
  it("delegates to existing verifier with exact action, resource and time", () => {
    const verify = vi.fn(() => true);
    const result = inspectSignedMissionApproval({ verify }, approval, context, now);
    expect(verify).toHaveBeenCalledWith(approval, "existing:mission", "synthetic-1", now);
    expect(result).toMatchObject({ missionId: "synthetic-1", verifiedByAuthority: true });
  });
  it("rejects verifier denial without constructing authority", () => {
    expect(inspectSignedMissionApproval({ verify: () => false }, approval, context, now)).toBeNull();
  });
  it("fails closed on verification exceptions", () => {
    expect(inspectSignedMissionApproval({ verify: () => { throw new Error("no authority"); } },
      approval, context, now)).toBeNull();
  });
  it("never verifies absent approvals", () => {
    const verify = vi.fn(() => true);
    expect(inspectSignedMissionApproval({ verify }, null, context, now)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });
  it("blocks non-disposable contexts and empty action/resource", () => {
    const verify = vi.fn(() => true);
    expect(inspectSignedMissionApproval({ verify }, approval, {
      ...context, mission: { ...mission, environment: "PRODUCTION" },
    }, now)).toBeNull();
    expect(inspectSignedMissionApproval({ verify }, approval, { ...context, action: "" }, now)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });
});
