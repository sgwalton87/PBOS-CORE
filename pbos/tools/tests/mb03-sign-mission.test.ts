import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeUnsignedMissionPayload, signMissionPayload } from "../mb03-sign-mission";
import { verifyHostedMissionApproval } from "../../production-runtime/hosted-signed-mission-approval";

describe("MB-03 custodian signer", () => {
  const keys = generateKeyPairSync("ed25519");
  const privatePem = Buffer.from(keys.privateKey.export({ format: "pem", type: "pkcs8" }) as string);
  const publicPem = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  it.each(["MB03-MISSION-001", "MB03-MISSION-002"] as const)("signs and verifies %s", missionId => {
    const payload = makeUnsignedMissionPayload(missionId, "viveca-walton", new Date("2026-11-24T20:00:00.000Z"), "11111111-1111-4111-8111-111111111111");
    const envelope = signMissionPayload(payload, privatePem, "", publicPem);
    expect(verifyHostedMissionApproval(envelope, { missionId, repository: "sgwalton87/playbook-platform", commit: payload.commit, operatorId: payload.operatorId,
      scope: missionId === "MB03-MISSION-001" ? { branch: "pbos/mission-MB03-MISSION-001", path: "docs/pbos-missions/MB03-MISSION-001.md", contentSha256: "bc314aa604692bd5545efe8346b1ad41cbddd97c6aa75a9beae75c98e8b6665f" } : { branch: "pbos/mission-MB03-MISSION-002", path: "docs/pbos-missions/MB03-MISSION-002.md", contentSha256: "a589864a241ac2d8d35416c317369d2ac350a4f1c254a6d1da0f1af575a2379b" } }, publicPem, new Date("2026-11-24T20:01:00.000Z"))).toBe(true);
  });
  it("rejects cross-mission reuse, wrong source, wrong operator and expiration", () => {
    const payload = makeUnsignedMissionPayload("MB03-MISSION-001", "viveca-walton", new Date("2026-11-24T20:00:00.000Z"), "22222222-2222-4222-8222-222222222222");
    const envelope = signMissionPayload(payload, privatePem, "", publicPem);
    const scope = { branch: "pbos/mission-MB03-MISSION-001", path: "docs/pbos-missions/MB03-MISSION-001.md", contentSha256: "bc314aa604692bd5545efe8346b1ad41cbddd97c6aa75a9beae75c98e8b6665f" };
    const expected = { missionId: "MB03-MISSION-001", repository: "sgwalton87/playbook-platform", commit: payload.commit, operatorId: "viveca-walton", scope };
    expect(verifyHostedMissionApproval(envelope, { ...expected, missionId: "MB03-MISSION-002", scope: { ...scope, branch: "pbos/mission-MB03-MISSION-002", path: "docs/pbos-missions/MB03-MISSION-002.md" } }, publicPem, new Date("2026-11-24T20:01:00.000Z"))).toBe(false);
    expect(verifyHostedMissionApproval(envelope, { ...expected, commit: "0".repeat(40) }, publicPem, new Date("2026-11-24T20:01:00.000Z"))).toBe(false);
    expect(verifyHostedMissionApproval(envelope, { ...expected, operatorId: "other" }, publicPem, new Date("2026-11-24T20:01:00.000Z"))).toBe(false);
    expect(verifyHostedMissionApproval(envelope, expected, publicPem, new Date("2026-11-24T20:16:00.000Z"))).toBe(false);
  });
});
