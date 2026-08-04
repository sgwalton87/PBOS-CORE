import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { playbookStagingActivationConfig } from "../../tools/playbook-staging-activation";

const bootstrap = {
    organizationId: "PLAYBOOK-ORG-001",
    connectorId: "PLAYBOOK-CONNECTOR-001",
    keyId: "pbos_playbook_staging_test",
    secretBase64: Buffer.alloc(32, 9).toString("base64"),
    expiresAt: "2030-08-04T00:00:00.000Z",
    certificationApprovalId: "PBOS-CERT-TEST",
    domainApprovalId: "PBOS-DOMAIN-TEST"
};

describe("CIP-045 live Playbook staging activation", () => {
    it("loads a protected bootstrap without exposing credentials in the activation configuration", () => {
        const directory = mkdtempSync(join(tmpdir(), "pbos-playbook-activation-"));
        const path = join(directory, "bootstrap.json");
        writeFileSync(path, JSON.stringify(bootstrap), { mode: 0o600 });

        const config = playbookStagingActivationConfig({
            PBOS_STAGING_ENDPOINT: "https://pbos.example.test",
            PBOS_PLAYBOOK_BOOTSTRAP_PATH: path,
            PBOS_PLAYBOOK_SUPABASE_USER_ID: "staging-scholar-001",
            PBOS_PLAYBOOK_EXCHANGE_APPROVAL_ID: "PBOS-EXCHANGE-TEST"
        });

        expect(config.endpoint).toBe("https://pbos.example.test/pbos/v1");
        expect(config.bootstrap.connectorId).toBe("PLAYBOOK-CONNECTOR-001");
        expect(JSON.stringify({ endpoint: config.endpoint, connectorId: config.bootstrap.connectorId }))
            .not.toContain(bootstrap.secretBase64);
    });

    it("fails closed without an explicit data-exchange approval", () => {
        const directory = mkdtempSync(join(tmpdir(), "pbos-playbook-approval-"));
        const path = join(directory, "bootstrap.json");
        writeFileSync(path, JSON.stringify(bootstrap), { mode: 0o600 });

        expect(() => playbookStagingActivationConfig({
            PBOS_STAGING_ENDPOINT: "https://pbos.example.test",
            PBOS_PLAYBOOK_BOOTSTRAP_PATH: path,
            PBOS_PLAYBOOK_SUPABASE_USER_ID: "staging-scholar-001"
        })).toThrow(/PBOS_PLAYBOOK_EXCHANGE_APPROVAL_ID/);
    });
});
