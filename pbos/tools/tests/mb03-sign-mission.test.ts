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
      scope: missionId === "MB03-MISSION-001" ? { branch: "pbos/mission-MB03-MISSION-001", path: "docs/pbos-missions/MB03-MISSION-001.md", contentSha256: "f47d3b241663ccf0f1a60ce7e5df7344ed246babd34fe96bca8105dea9910746" } : { branch: "pbos/mission-MB03-MISSION-002", path: "docs/pbos-missions/MB03-MISSION-002.md", contentSha256: "4b48dca4e087a6355b1621639eb35c8722af91844067a9493783f6b2207bbaad" } }, publicPem, new Date("2026-11-24T20:01:00.000Z"))).toBe(true);
  });
  it("rejects cross-mission reuse, wrong source, wrong operator and expiration", () => {
    const payload = makeUnsignedMissionPayload("MB03-MISSION-001", "viveca-walton", new Date("2026-11-24T20:00:00.000Z"), "22222222-2222-4222-8222-222222222222");
    const envelope = signMissionPayload(payload, privatePem, "", publicPem);
    const scope = { branch: "pbos/mission-MB03-MISSION-001", path: "docs/pbos-missions/MB03-MISSION-001.md", contentSha256: "f47d3b241663ccf0f1a60ce7e5df7344ed246babd34fe96bca8105dea9910746" };
    const expected = { missionId: "MB03-MISSION-001", repository: "sgwalton87/playbook-platform", commit: payload.commit, operatorId: "viveca-walton", scope };
    expect(verifyHostedMissionApproval(envelope, { ...expected, missionId: "MB03-MISSION-002", scope: { ...scope, branch: "pbos/mission-MB03-MISSION-002", path: "docs/pbos-missions/MB03-MISSION-002.md" } }, publicPem, new Date("2026-11-24T20:01:00.000Z"))).toBe(false);
    expect(verifyHostedMissionApproval(envelope, { ...expected, commit: "0".repeat(40) }, publicPem, new Date("2026-11-24T20:01:00.000Z"))).toBe(false);
    expect(verifyHostedMissionApproval(envelope, { ...expected, operatorId: "other" }, publicPem, new Date("2026-11-24T20:01:00.000Z"))).toBe(false);
    expect(verifyHostedMissionApproval(envelope, expected, publicPem, new Date("2026-11-24T20:16:00.000Z"))).toBe(false);
  });
});
