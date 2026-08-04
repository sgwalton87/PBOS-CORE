import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BULLETPROOF_CONNECTOR_MANIFEST, BULLETPROOF_DOMAIN_MANIFEST, bulletproofExternalIdentity } from "../../reference-systems";

describe("CIP-046 Bulletproof staging activation preparation", () => {
    it("keeps Bulletproof identities independent from Playbook", () => {
        expect(BULLETPROOF_CONNECTOR_MANIFEST).toMatchObject({
            connectorId: "BULLETPROOF-CONNECTOR-001",
            externalSystemId: "BULLETPROOF-SYSTEM-001",
            pbosSystemId: "BULLETPROOF-OS-001"
        });
        expect(BULLETPROOF_DOMAIN_MANIFEST.connectorId).toBe("BULLETPROOF-CONNECTOR-001");
        expect(bulletproofExternalIdentity("member-001").pbosIdentity.systemId).toBe("BULLETPROOF-OS-001");
        expect(BULLETPROOF_CONNECTOR_MANIFEST.permissions).toContain("READ_RUNTIME_HEALTH");
        expect(BULLETPROOF_CONNECTOR_MANIFEST.capabilities).toContainEqual(
            expect.objectContaining({ capabilityId: "BULLETPROOF_RUNTIME_HEALTH",
                requiredPermissions: ["READ_RUNTIME_HEALTH"] })
        );
    });

    it("requires protected bootstrap input and never manufactures approval", () => {
        const source = readFileSync(resolve(process.cwd(), "pbos/tools/bulletproof-staging-activation.ts"), "utf8");
        expect(source).toContain("PBOS_BULLETPROOF_BOOTSTRAP_PATH");
        expect(source).toContain("bootstrap.certificationApprovalId");
        expect(source).toContain("bootstrap.domainApprovalId");
        expect(source).not.toContain("randomBytes");
    });
});
