import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { cloudRunRuntimeConfig, createCloudRunIntegrationService } from "../cloud-run-runtime";

const trustBundle = JSON.stringify({
    credentials: [{
        credentialId: "CREDENTIAL-001",
        organizationId: "PLAYBOOK-ORG-001",
        connectorId: "PLAYBOOK-CONNECTOR-001",
        keyId: "pbos_playbook_staging_001",
        scopes: ["REGISTER_SYSTEM"],
        status: "ACTIVE",
        issuedBy: "PBOS-CREDENTIAL-AUTHORITY",
        approvalId: "APPROVAL-001",
        issuedAt: "2026-08-04T00:00:00.000Z",
        expiresAt: "2030-08-04T00:00:00.000Z",
        secretBase64: Buffer.alloc(32, 7).toString("base64")
    }],
    allowedRuntimeActions: ["READ_RUNTIME_HEALTH"]
});

describe("CIP-047 Cloud Run runtime", () => {
    it("fails closed when required deployment configuration is absent", () => {
        expect(() => cloudRunRuntimeConfig({})).toThrow(/PBOS_CONNECTOR_TRUST_BUNDLE/);
    });

    it("serves health while keeping the PBOS API authenticated", async () => {
        const statePath = join(mkdtempSync(join(tmpdir(), "pbos-cloud-run-")), "state.json");
        const config = cloudRunRuntimeConfig({
            PORT: "8080",
            PBOS_ORGANIZATION_ID: "PLAYBOOK-ORG-001",
            PBOS_INTEGRATION_STATE_PATH: statePath,
            PBOS_CONNECTOR_TRUST_BUNDLE: trustBundle,
            PBOS_ALLOWED_ORIGINS: "https://staging.playbook.example"
        });
        const service = createCloudRunIntegrationService(config);
        const address = await service.start(0, "127.0.0.1");
        try {
            const health = await fetch(`http://127.0.0.1:${address.port}/health`);
            expect(health.status).toBe(200);
            await expect(health.json()).resolves.toMatchObject({ status: "healthy" });

            const reserved = await fetch(`http://127.0.0.1:${address.port}/healthz`);
            expect(reserved.status).toBe(404);

            const anonymous = await fetch(`http://127.0.0.1:${address.port}/pbos/v1`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ apiVersion: "v1", operation: "REGISTER_SYSTEM", correlationId: "anonymous" })
            });
            expect(anonymous.status).toBe(401);
        } finally {
            await service.stop();
        }
    });
});
