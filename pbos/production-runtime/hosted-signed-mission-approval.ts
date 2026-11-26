/**
 * Hosted mission authorization verification boundary.
 * A valid signature is necessary but never sufficient for execution:
 * canonical Genesis identity, durable state, fenced lease, and host attestation
 * must be verified separately. No signing key is generated or stored here.
 */
import type { PlanReadyHandoff } from "./plan-ready-lease-handoff";
import { createHash, createPublicKey, verify } from "node:crypto";

export interface HostedMissionScope {
  readonly branch: string;
  readonly path: string;
  readonly contentSha256: string;
}

export function hostedMissionScopeDigest(scope: HostedMissionScope): string {
  return createHash("sha256").update(JSON.stringify([
    scope.branch, scope.path, scope.contentSha256
  ])).digest("hex");
}

export interface SignedHostedMissionApproval {
  readonly payload: {
    readonly schema: "pbos.hosted-mission-approval.v1";
    readonly missionId: string;
    readonly repository: string;
    readonly commit: string;
    readonly operatorId: string;
    readonly scopeDigest: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
    readonly nonce: string;
  };
  readonly signatureBase64: string;
}
export interface HostedMissionLineage {
  readonly missionId: string;
  readonly repository: string;
  readonly commit: string;
  readonly operatorId: string;
  readonly scope: HostedMissionScope;
}
export function verifyHostedMissionApproval(
  approval: SignedHostedMissionApproval,
  expected: HostedMissionLineage,
  trustedEd25519PublicKeyPem: string,
  now = new Date()
): boolean {
  try {
    return verifyEnvelope(approval, expected, trustedEd25519PublicKeyPem, now, "pbos.hosted-mission-approval.v1",
      hostedMissionScopeDigest(expected.scope));
  } catch {
    return false;
  }
}

export interface PlanReadyRecoveryAuthorization {
  readonly pin: PlanReadyHandoff;
  readonly publicationBase: string;
  readonly approval: SignedPlanReadyApproval;
}
export interface SignedPlanReadyApproval {
  readonly payload: Omit<SignedHostedMissionApproval["payload"], "schema"> & {
    readonly schema: "pbos.hosted-plan-ready-recovery.v1";
  };
  readonly signatureBase64: string;
}

// The original nonce identifies the interrupted attempt; the recovery signature
// has its own nonce. Normal admission rejects this schema even with the same key.
export function planReadyRecoveryDigest(pin: PlanReadyHandoff, publicationBase: string): string {
  return createHash("sha256").update(JSON.stringify([
    "EXECUTION_PLAN_READY", pin.runId, pin.missionId, pin.repository, pin.commit, pin.scopeDigest,
    pin.nonce, pin.oldLeaseId, pin.stateGeneration, pin.lockGeneration, pin.stateSha256, publicationBase
  ])).digest("hex");
}

export function verifyPlanReadyRecoveryApproval(recovery: PlanReadyRecoveryAuthorization,
  expected: HostedMissionLineage, key: string, now = new Date()): boolean {
  const { approval, pin, publicationBase } = recovery;
  return pin.commit === expected.commit && pin.repository === expected.repository &&
    pin.missionId === expected.missionId && pin.scopeDigest === hostedMissionScopeDigest(expected.scope) &&
    /^[a-f0-9]{40}$/.test(publicationBase) && approval.payload.nonce !== pin.nonce &&
    verifyEnvelope(approval, expected, key, now, "pbos.hosted-plan-ready-recovery.v1", planReadyRecoveryDigest(pin, publicationBase));
}

export function hostedApprovalSigningBytes(p: (SignedHostedMissionApproval | SignedPlanReadyApproval)["payload"]): Buffer {
  return Buffer.from(JSON.stringify([p.schema, p.missionId, p.repository, p.commit,
    p.operatorId, p.scopeDigest, p.issuedAt, p.expiresAt, p.nonce]), "utf8");
}

function verifyEnvelope(approval: SignedHostedMissionApproval | SignedPlanReadyApproval, expected: HostedMissionLineage,
  trustedEd25519PublicKeyPem: string, now: Date, schema: typeof approval.payload.schema, digest: string): boolean {
  try {
    const p = approval.payload;
    if (p.schema !== schema ||
        !p.missionId || !p.repository || !p.operatorId ||
        !/^[a-f0-9]{40}$/i.test(p.commit) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.nonce) ||
        p.missionId !== expected.missionId ||
        p.repository !== expected.repository ||
        p.commit !== expected.commit ||
        p.operatorId !== expected.operatorId ||
        !/^[a-f0-9]{64}$/.test(p.scopeDigest) ||
        p.scopeDigest !== digest) return false;
    const issued = Date.parse(p.issuedAt);
    const expires = Date.parse(p.expiresAt);
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(issued) || !Number.isFinite(expires) ||
        issued > now.getTime() || expires <= now.getTime() ||
        expires <= issued || expires - issued > 15 * 60_000) return false;
    if (!/^[A-Za-z0-9+/]{86}==?$/.test(approval.signatureBase64)) return false;
    const key = createPublicKey(trustedEd25519PublicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") return false;
    return verify(null, hostedApprovalSigningBytes(p), key,
      Buffer.from(approval.signatureBase64, "base64"));
  } catch {
    return false;
  }
}
