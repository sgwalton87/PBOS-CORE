import { createHash } from "crypto";
import {
    DurableIntegrationState, INTEGRATION_STATE_SCHEMA_VERSION, IntegrationIdempotencyRecord,
    IntegrationRevocation, IntegrationStateMigration, IntegrationTenantState
} from "./contracts";

export const emptyTenant = (organizationId: string): IntegrationTenantState => ({
    organizationId, connectors: [], domains: [], identities: [], events: [], revocations: [], idempotency: []
});

export const emptyIntegrationState = (): DurableIntegrationState => ({
    schemaVersion: INTEGRATION_STATE_SCHEMA_VERSION, revision: 0, tenants: []
});

export class IntegrationStateMigrationRegistry {
    private readonly migrations = new Map<number, IntegrationStateMigration>();
    register(fromVersion: number, migration: IntegrationStateMigration): void {
        if (!Number.isInteger(fromVersion) || fromVersion < 0 || this.migrations.has(fromVersion)) {
            throw new Error(`Integration migration already registered or invalid: ${fromVersion}`);
        }
        this.migrations.set(fromVersion, migration);
    }
    migrate(input: DurableIntegrationState): DurableIntegrationState {
        let state = input;
        if (state.schemaVersion > INTEGRATION_STATE_SCHEMA_VERSION) {
            throw new Error(`Integration state schema ${state.schemaVersion} is newer than supported schema ${INTEGRATION_STATE_SCHEMA_VERSION}.`);
        }
        while (state.schemaVersion < INTEGRATION_STATE_SCHEMA_VERSION) {
            const migration = this.migrations.get(state.schemaVersion);
            if (!migration) throw new Error(`Missing integration state migration from schema ${state.schemaVersion}.`);
            const migrated = migration(state);
            if (migrated.schemaVersion !== state.schemaVersion + 1) throw new Error("Integration migrations must advance exactly one schema version.");
            state = migrated;
        }
        return state;
    }
}

export const defaultIntegrationMigrations = (): IntegrationStateMigrationRegistry => {
    const registry = new IntegrationStateMigrationRegistry();
    registry.register(0, state => ({ schemaVersion: 1, revision: state.revision ?? 0, tenants: state.tenants ?? [] }));
    return registry;
};

export function assertOrganizationId(organizationId: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(organizationId)) throw new Error("A valid organization ID is required.");
}

export function assertExpectedRevision(state: DurableIntegrationState, expectedRevision?: number): void {
    if (expectedRevision !== undefined && state.revision !== expectedRevision) {
        throw new Error(`Integration state revision conflict: expected ${expectedRevision}, found ${state.revision}.`);
    }
}

export function validateRevocation(revocation: IntegrationRevocation): void {
    assertOrganizationId(revocation.organizationId);
    if (!revocation.revocationId || !revocation.resourceId || !revocation.reason || !revocation.revokedBy || !revocation.approvalId) {
        throw new Error("Integration revocation requires identity, reason, actor, and verifiable approval.");
    }
}

export function validateIdempotency(record: IntegrationIdempotencyRecord): void {
    assertOrganizationId(record.organizationId);
    if (!record.key || !record.operation || !/^[a-f0-9]{64}$/i.test(record.requestHash)) {
        throw new Error("Integration idempotency requires a key, operation, and SHA-256 request hash.");
    }
}

export const requestHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
