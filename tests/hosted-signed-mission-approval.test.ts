import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyHostedMissionApproval } from "../pbos/production-runtime/hosted-signed-mission-approval";

describe("hosted signed mission approval", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const now = new Date("2026-11-22T12:00:00Z");
  const payload = {
    schema: "pbos.hosted-mission-approval.v1" as const,
    missionId: "test-mission",
    repository: "sgwalton87/PBOS-CORE",
    commit: "a".repeat(40),
    operatorId: "operator-test",
    issuedAt: "2026-11-22T11:59:00Z",
    expiresAt: "2026-11-22T12:05:00Z",
    nonce: "12345678-1234-1234-1234-123456789abc"
  };
  const expected = {
    missionId: payload.missionId, repository: payload.repository,
    commit: payload.commit, operatorId: payload.operatorId
  };
  function signed(p = payload) {
    const canonical = JSON.stringify([
      p.schema, p.missionId, p.repository, p.commit, p.operatorId,
      p.issuedAt, p.expiresAt, p.nonce
    ]);
    return { payload: p, signatureBase64: sign(null, Buffer.from(canonical), privateKey).toString("base64") };
  }
  it("accepts an exact unexpired Ed25519 approval", () => {
    expect(verifyHostedMissionApproval(signed(), expected, publicPem, now)).toBe(true);
  });
  it("rejects a different mission, commit or operator", () => {
    for (const key of ["missionId", "commit", "operatorId"] as const) {
      expect(verifyHostedMissionApproval(signed(), { ...expected, [key]: "other" }, publicPem, now)).toBe(false);
    }
  });
  it("rejects tampering, expiry and wrong trust root", () => {
    expect(verifyHostedMissionApproval({ ...signed(), payload: { ...payload, missionId: "tampered" } }, expected, publicPem, now)).toBe(false);
    expect(verifyHostedMissionApproval(signed(), expected, publicPem, new Date("2026-11-22T12:06:00Z"))).toBe(false);
    const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(verifyHostedMissionApproval(signed(), expected, other, now)).toBe(false);
  });
  it("rejects overlong approval validity windows", () => {
    const p = { ...payload, expiresAt: "2026-11-22T13:00:00Z" };
    expect(verifyHostedMissionApproval(signed(p), expected, publicPem, now)).toBe(false);
  });
});
