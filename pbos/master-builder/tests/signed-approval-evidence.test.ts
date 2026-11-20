import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OperatorIdentityService } from "../../genesis-state/operator-identity";
import type { VerifiableApproval } from "../../genesis-state/operator-identity";
import { inspectSignedMissionApproval, inspectScopedDisposableMissionApproval, disposableMissionApprovalScope } from "../signed-approval-evidence";
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

describe("exact mission-scoped existing operator approval", () => {
  it("binds the signature verification resource to mission, repo, commit and namespace", () => {
    const scope = disposableMissionApprovalScope(mission);
    const verify = vi.fn((candidate: VerifiableApproval, action: string, resource: string) =>
      candidate.action === action && candidate.resource === resource);
    const signed = { ...approval, action: scope.action, resource: scope.resource };
    const result = inspectScopedDisposableMissionApproval({ verify }, signed, mission, now);
    expect(result?.verifiedByAuthority).toBe(true);
    expect(verify).toHaveBeenCalledWith(signed, scope.action, scope.resource, now);
    expect(inspectScopedDisposableMissionApproval({ verify }, signed, {
      ...mission, sourceSha: "b".repeat(40),
    }, now)).toBeNull();
    expect(inspectScopedDisposableMissionApproval({ verify }, signed, {
      ...mission, stateNamespace: "other-disposable-state",
    }, now)).toBeNull();
  });
  it("rejects wildcard and production mission scopes before verifier invocation", () => {
    const verify = vi.fn(() => true);
    expect(inspectScopedDisposableMissionApproval({ verify }, approval, {
      ...mission, missionId: "*",
    }, now)).toBeNull();
    expect(inspectScopedDisposableMissionApproval({ verify }, approval, {
      ...mission, environment: "PRODUCTION",
    }, now)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("real existing operator HMAC approval integration (disposable only)", () => {
  it("verifies genuine signature and rejects tampering and mission reuse", () => {
    const dir = mkdtempSync(join(tmpdir(), "pbos-master-builder-approval-"));
    try {
      const identities = new OperatorIdentityService(join(dir, "operators.json"));
      const { operator, credential } = identities.enroll("disposable-org", "Test operator");
      const authenticated = identities.authenticate(operator.operatorId, credential);
      const scope = disposableMissionApprovalScope(mission);
      const signed = identities.approve(authenticated, scope.action, scope.resource, 30);
      const verified = inspectScopedDisposableMissionApproval(identities, signed, mission, new Date());
      expect(verified).toMatchObject({ missionId: mission.missionId, verifiedByAuthority: true });
      expect(inspectScopedDisposableMissionApproval(identities,
        { ...signed, signature: "0".repeat(signed.signature.length) }, mission, new Date())).toBeNull();
      expect(inspectScopedDisposableMissionApproval(identities, signed,
        { ...mission, repository: "test/another" }, new Date())).toBeNull();
      expect(inspectScopedDisposableMissionApproval(identities, signed,
        { ...mission, sourceSha: "b".repeat(40) }, new Date())).toBeNull();
      expect(inspectScopedDisposableMissionApproval(identities, signed,
        mission, new Date(Date.parse(signed.expiresAt) + 1000))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
