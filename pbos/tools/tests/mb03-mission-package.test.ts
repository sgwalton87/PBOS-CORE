import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRemotePlaybookMission } from "../../master-builder/playbook-remote-mission";
import { hostedMissionScopeDigest, type SignedHostedMissionApproval } from "../../production-runtime/hosted-signed-mission-approval";
import { MB03_PROTECTED_PACKAGE_BINDINGS, validateProtectedPlaybookMissionFile, type ProtectedPlaybookMissionFile } from "../mb03-mission-package";

function fixture() {
    const keys = generateKeyPairSync("ed25519");
    const missionId = "MB03-MISSION-001" as const;
    const repository = "sgwalton87/playbook-platform";
    const commit = "a".repeat(40);
    const nonce = "11111111-1111-4111-8111-111111111111";
    const before = "# Before\n";
    const after = "# Approved output\n";
    const scope = {
        branch: "pbos/mission-MB03-MISSION-001",
        path: "docs/pbos-missions/MB03-MISSION-001.md",
        contentSha256: createHash("sha256").update(after).digest("hex")
    };
    // The fixture's scope digest is structural; the production builder uses the
    // reviewed mission digest constants and validates proposal bytes separately.
    const payload = {
        schema: "pbos.hosted-mission-approval.v1" as const, missionId, repository,
        commit, operatorId: "viveca-walton", scopeDigest: hostedMissionScopeDigest(scope),
        issuedAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce
    };
    const canonical = JSON.stringify([payload.schema, payload.missionId, payload.repository,
        payload.commit, payload.operatorId, payload.scopeDigest, payload.issuedAt, payload.expiresAt, payload.nonce]);
    const approval: SignedHostedMissionApproval = {
        payload, signatureBase64: sign(null, Buffer.from(canonical), keys.privateKey).toString("base64")
    };
    const target = { missionId, before, after };
    const mission = createRemotePlaybookMission(commit, MB03_PROTECTED_PACKAGE_BINDINGS.workerId,
        MB03_PROTECTED_PACKAGE_BINDINGS.stateNamespace, nonce, target);
    const request = {
        systemId: MB03_PROTECTED_PACKAGE_BINDINGS.systemId,
        actorId: payload.operatorId,
        authorizationArtifactId: `hosted-approval:${nonce}`,
        repository, branch: scope.branch, commit,
        approvedMissionIds: [missionId], maximumMissions: 1, autonomousContinuation: false,
        triggerSource: "CLI" as const,
        buildChannel: {
            channelId: MB03_PROTECTED_PACKAGE_BINDINGS.channelId,
            systemId: MB03_PROTECTED_PACKAGE_BINDINGS.systemId,
            operatingSystemId: MB03_PROTECTED_PACKAGE_BINDINGS.operatingSystemId,
            connectorId: MB03_PROTECTED_PACKAGE_BINDINGS.connectorId,
            repository, domainRegistrationIds: [MB03_PROTECTED_PACKAGE_BINDINGS.domainRegistrationId]
        }
    };
    const packageFile = { request, approval, mission, scope, target } as ProtectedPlaybookMissionFile;
    return { keys, packageFile };
}

describe("MB-03 complete mission package", () => {
    it("accepts a structurally complete package and verifies its signature", () => {
        const { keys, packageFile } = fixture();
        expect(() => validateProtectedPlaybookMissionFile(packageFile,
            keys.publicKey.export({ type: "spki", format: "pem" }).toString())).not.toThrow();
    });

    it("rejects an approval envelope without request, mission, scope, and target", () => {
        const { packageFile } = fixture();
        expect(() => validateProtectedPlaybookMissionFile({ approval: packageFile.approval } as unknown as ProtectedPlaybookMissionFile))
            .toThrow();
    });

    it("rejects content or branch changes without consuming a signature", () => {
        const { packageFile } = fixture();
        expect(() => validateProtectedPlaybookMissionFile({
            ...packageFile, scope: { ...packageFile.scope, branch: "main" }
        })).toThrow("signed scope");
        expect(() => validateProtectedPlaybookMissionFile({
            ...packageFile, target: { ...packageFile.target, after: "# altered\n" }
        })).toThrow("signed scope");
    });

    it("rejects an expired or cross-mission signature", () => {
        const { keys, packageFile } = fixture();
        const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
        expect(() => validateProtectedPlaybookMissionFile(packageFile, publicPem, new Date(Date.now() + 120_000)))
            .toThrow("signature");
        expect(() => validateProtectedPlaybookMissionFile({
            ...packageFile,
            approval: { ...packageFile.approval, payload: { ...packageFile.approval.payload, missionId: "MB03-MISSION-002" } }
        })).toThrow("signed scope");
    });
});
