import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyIntegrationStateRestore } from "../../tools/integration-state-restore-evidence";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

describe("CIP-047 integration state restore evidence", () => {
    it("requires byte-identical backup and semantic tenant evidence", () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-restore-"));
        const source = join(root, "source.json");
        const restored = join(root, "restored.json");
        const value = { schemaVersion: 1, revision: 4, tenants: [{ organizationId: "PLAYBOOK-ORG-001",
            connectors: [{}], domains: [{}], identities: [{}], events: [{}], revocations: [], idempotency: [] }] };
        writeFileSync(source, JSON.stringify(value));
        writeFileSync(restored, JSON.stringify(value));
        process.env.PBOS_BACKUP_SOURCE_PATH = source;
        process.env.PBOS_RESTORED_STATE_PATH = restored;
        process.env.PBOS_RESTORE_ORGANIZATION_ID = "PLAYBOOK-ORG-001";
        expect(verifyIntegrationStateRestore()).toMatchObject({ revision: 4,
            counts: { connectors: 1, domains: 1, identities: 1, events: 1 } });
        writeFileSync(restored, `${JSON.stringify(value)}\n`);
        expect(() => verifyIntegrationStateRestore()).toThrow("digest does not match");
    });
});
