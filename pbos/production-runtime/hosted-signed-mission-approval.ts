/**
 * Hosted mission authorization verification boundary.
 * A valid signature is necessary but never sufficient for execution:
 * canonical Genesis identity, durable state, fenced lease, and host attestation
 * must be verified separately. No signing key is generated or stored here.
 */
import { createPublicKey, verify } from "node:crypto";

export interface SignedHostedMissionApproval {
  readonly payload: {
    readonly schema: "pbos.hosted-mission-approval.v1";
    readonly missionId: string;
    readonly repository: string;
    readonly commit: string;
    readonly operatorId: string;
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
}
export function verifyHostedMissionApproval(
  approval: SignedHostedMissionApproval,
  expected: HostedMissionLineage,
  trustedEd25519PublicKeyPem: string,
  now = new Date()
): boolean {
  try {
    const p = approval.payload;
    if (p.schema !== "pbos.hosted-mission-approval.v1" ||
        !p.missionId || !p.repository || !p.operatorId ||
        !/^[a-f0-9]{40}$/i.test(p.commit) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.nonce) ||
        p.missionId !== expected.missionId ||
        p.repository !== expected.repository ||
        p.commit !== expected.commit ||
        p.operatorId !== expected.operatorId) return false;
    const issued = Date.parse(p.issuedAt);
    const expires = Date.parse(p.expiresAt);
    if (!Number.isFinite(issued) || !Number.isFinite(expires) ||
        issued > now.getTime() || expires <= now.getTime() ||
        expires <= issued || expires - issued > 15 * 60_000) return false;
    if (!/^[A-Za-z0-9+/]{86}==?$/.test(approval.signatureBase64)) return false;
    const key = createPublicKey(trustedEd25519PublicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") return false;
    const canonical = JSON.stringify([
      p.schema, p.missionId, p.repository, p.commit, p.operatorId,
      p.issuedAt, p.expiresAt, p.nonce
    ]);
    return verify(null, Buffer.from(canonical, "utf8"), key,
      Buffer.from(approval.signatureBase64, "base64"));
  } catch {
    return false;
  }
}
