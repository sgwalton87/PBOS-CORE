import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildMissionPackage } from "../mb03-mission-package";
import { hostedMissionScopeDigest } from "../../production-runtime/hosted-signed-mission-approval";

describe("MB-03 mission package", () => {
  it("builds the complete controller input from an exact signed envelope", () => {
    const keys = generateKeyPairSync("ed25519");
    const target = { missionId: "MB03-MISSION-001" as const, before: "before\n", after: "after\n" };
    const scope = { branch: "pbos/mission-MB03-MISSION-001", path: "docs/pbos-missions/MB03-MISSION-001.md", contentSha256: "" };
    const { createHash } = require("node:crypto");
    scope.contentSha256 = createHash("sha256").update(target.after).digest("hex");
    const now = new Date();
    const payload = { schema: "pbos.hosted-mission-approval.v1" as const, missionId: target.missionId,
      repository: "sgwalton87/playbook-platform", commit: "a".repeat(40), operatorId: "viveca-walton",
      scopeDigest: hostedMissionScopeDigest(scope), issuedAt: new Date(now.getTime() - 1000).toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(), nonce: "11111111-1111-4111-8111-111111111111" };
    const canonical = JSON.stringify([payload.schema, payload.missionId, payload.repository, payload.commit,
      payload.operatorId, payload.scopeDigest, payload.issuedAt, payload.expiresAt, payload.nonce]);
    const approval = { payload, signatureBase64: sign(null, Buffer.from(canonical), keys.privateKey).toString("base64") };
    const pkg = buildMissionPackage({ approval, target, operatorPublicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
      workerId: "reviewed-worker", stateNamespace: "mb03-stage4-synthetic-20261124", systemId: "PLAYBOOK-SYSTEM-001",
      channelId: "mb03-staging-build-channel", operatingSystemId: "PBOS", connectorId: "sandbox-provider", domainRegistrationIds: ["playbook-staging"] });
    expect(pkg.request.authorizationArtifactId).toBe("hosted-approval:" + payload.nonce);
    expect(pkg.mission.attemptId).toBe(payload.nonce);
  });

  it("rejects a signing envelope without the complete target binding", () => {
    const keys = generateKeyPairSync("ed25519");
    const target = { missionId: "MB03-MISSION-001" as const, before: "before\n", after: "after\n" };
    const payload = { schema: "pbos.hosted-mission-approval.v1" as const, missionId: target.missionId,
      repository: "sgwalton87/playbook-platform", commit: "a".repeat(40), operatorId: "viveca-walton",
      scopeDigest: "0".repeat(64), issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce: "11111111-1111-4111-8111-111111111111" };
    expect(() => buildMissionPackage({ approval: { payload, signatureBase64: "A".repeat(88) }, target,
      operatorPublicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(), workerId: "worker",
      stateNamespace: "mb03-stage4-synthetic-20261124", systemId: "PLAYBOOK-SYSTEM-001", channelId: "channel",
      operatingSystemId: "PBOS", connectorId: "sandbox", domainRegistrationIds: ["staging"] })).toThrow();
  });
});
