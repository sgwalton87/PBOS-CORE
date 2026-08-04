import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DurableIntegrationState } from "../integration";

const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Required restore-evidence configuration is missing: ${name}`);
    return value;
};

const load = (path: string): { bytes: Buffer; state: DurableIntegrationState } => {
    const bytes = readFileSync(path);
    const state = JSON.parse(bytes.toString("utf8")) as DurableIntegrationState;
    if (!Number.isInteger(state.schemaVersion) || !Number.isInteger(state.revision) || !Array.isArray(state.tenants)) {
        throw new Error(`Invalid durable integration state: ${path}`);
    }
    return { bytes, state };
};

const digest = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

export function verifyIntegrationStateRestore(): unknown {
    const source = load(required("PBOS_BACKUP_SOURCE_PATH"));
    const restored = load(required("PBOS_RESTORED_STATE_PATH"));
    const organizationId = required("PBOS_RESTORE_ORGANIZATION_ID");
    const sourceDigest = digest(source.bytes);
    const restoredDigest = digest(restored.bytes);
    if (sourceDigest !== restoredDigest) throw new Error("Restored state digest does not match its immutable backup source.");
    const tenant = restored.state.tenants.find(item => item.organizationId === organizationId);
    if (!tenant || tenant.connectors.length === 0 || tenant.domains.length === 0 || tenant.identities.length === 0 || tenant.events.length === 0) {
        throw new Error("Restored tenant state lacks required connector, domain, identity, or audit evidence.");
    }
    return { evidenceId: `PBOS-RESTORE-${organizationId}-001`, organizationId, sha256: restoredDigest,
        schemaVersion: restored.state.schemaVersion, revision: restored.state.revision,
        counts: { connectors: tenant.connectors.length, domains: tenant.domains.length,
            identities: tenant.identities.length, events: tenant.events.length, revocations: tenant.revocations.length },
        verifiedAt: new Date().toISOString() };
}

if (require.main === module) {
    try { process.stdout.write(`${JSON.stringify(verifyIntegrationStateRestore(), null, 2)}\n`); }
    catch (error) {
        process.stderr.write(`Integration state restore evidence failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
