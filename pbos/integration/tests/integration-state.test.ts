import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
    ConnectedSystemRegistry, DomainRegistrationRegistry, FileIntegrationStateRepository, IdentityMapper,
    InMemoryIntegrationStateRepository, IntegrationStateMigrationRegistry, requestHash,
    RuntimeCommunicationBoundary, SystemConnector
} from "../index";

const connector = (connectorId = "CONNECTOR-001"): SystemConnector => ({
    connectorId, externalSystemId: "SYSTEM-001", pbosSystemId: "PBOS-OS-001", name: "Example", version: "1.0.0",
    domainIds: ["DOMAIN-001"], capabilities: [{ capabilityId: "HEALTH", name: "Health", type: "SERVICE", version: "1.0.0",
        requiredPermissions: ["READ_RUNTIME_HEALTH"], inputSchemaId: "health.in.v1", outputSchemaId: "health.out.v1", active: true }],
    permissions: ["READ_RUNTIME_HEALTH"], communicationRules: ["HEALTH_CHECK"], status: "ACTIVE",
    certification: "CERTIFIED", registeredAt: new Date("2026-08-04T00:00:00.000Z")
});

describe("CIP-038 integration state and migrations", () => {
    it("persists connector, domain, identity, and event state across repository processes", async () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-integration-restart-")), "state.json");
        const first = new FileIntegrationStateRepository(path);
        const systems = new ConnectedSystemRegistry(first, "ORG-001");
        systems.register(connector());
        const domains = new DomainRegistrationRegistry(systems, first, "ORG-001");
        domains.register({ registrationId: "REGISTRATION-001", connectorId: "CONNECTOR-001", externalSystemId: "SYSTEM-001",
            pbosSystemId: "PBOS-OS-001", domainId: "DOMAIN-001", capabilityIds: ["HEALTH"], workflowIds: [],
            requiredServiceIds: ["PBOS-RUNTIME"], governanceRequirementIds: ["AUTHORITY"], status: "ACTIVE",
            registeredAt: new Date("2026-08-04T00:00:30.000Z"), updatedAt: new Date("2026-08-04T00:00:30.000Z") });
        const identities = new IdentityMapper(first, "ORG-001");
        identities.map({ mappingId: "IDENTITY-001",
            externalIdentity: { externalIdentityId: "external-1", externalSystemId: "SYSTEM-001", role: "MEMBER",
                authorityReferences: ["AUTH-001"], active: true },
            pbosIdentity: { actorId: "actor-1", systemId: "PBOS-OS-001", role: "MEMBER",
                authorityContext: ["AUTH-001"], provenance: "SYSTEM-001:external-1", active: true },
            mappedAt: new Date("2026-08-04T00:01:00.000Z") });
        const runtime = new RuntimeCommunicationBoundary(systems, domains, { HEALTH_CHECK: async () => ({ healthy: true }) }, first, "ORG-001");
        await runtime.communicate({ communicationId: "communication-1", connectorId: "CONNECTOR-001",
            domainRegistrationId: "REGISTRATION-001", type: "HEALTH_CHECK", actorId: "actor-1",
            authority: { allowed: true, actorId: "actor-1", action: "READ_RUNTIME_HEALTH", authorityId: "AUTH-001", reason: "allowed" },
            payload: {}, purpose: "Restart evidence", correlationId: "correlation-1", provenance: ["SYSTEM-001"], requestedAt: new Date() });

        const restarted = new FileIntegrationStateRepository(path);
        expect(new ConnectedSystemRegistry(restarted, "ORG-001").get("CONNECTOR-001")?.registeredAt).toBeInstanceOf(Date);
        expect(restarted.domains("ORG-001")[0].status).toBe("ACTIVE");
        expect(new IdentityMapper(restarted, "ORG-001").get("IDENTITY-001")?.mappedAt).toBeInstanceOf(Date);
        expect(restarted.events("ORG-001", "CONNECTOR-001")[0].correlationId).toBe("correlation-1");
    });

    it("isolates organizations and permits version uniqueness within each tenant", () => {
        const repository = new InMemoryIntegrationStateRepository();
        new ConnectedSystemRegistry(repository, "ORG-ONE").register(connector());
        expect(new ConnectedSystemRegistry(repository, "ORG-TWO").get("CONNECTOR-001")).toBeUndefined();
        new ConnectedSystemRegistry(repository, "ORG-TWO").register(connector());
        expect(() => new ConnectedSystemRegistry(repository, "ORG-ONE").register(connector("CONNECTOR-002")))
            .toThrow("version already registered");
    });

    it("rejects stale concurrent revisions without losing the winning write", () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-integration-concurrency-")), "state.json");
        const first = new FileIntegrationStateRepository(path);
        const second = new FileIntegrationStateRepository(path);
        const revision = first.revision();
        first.saveConnector("ORG-001", connector(), revision);
        expect(() => second.saveConnector("ORG-001", connector("CONNECTOR-002"), revision)).toThrow("revision conflict");
        expect(new FileIntegrationStateRepository(path).connectors("ORG-001")).toHaveLength(1);
    });

    it("observes governed revocation across processes", () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-integration-revocation-")), "state.json");
        const first = new ConnectedSystemRegistry(new FileIntegrationStateRepository(path), "ORG-001");
        first.register(connector());
        const second = new ConnectedSystemRegistry(new FileIntegrationStateRepository(path), "ORG-001");
        first.revoke("CONNECTOR-001", "Credential compromise", "operator-1", "approval-1");
        expect(second.get("CONNECTOR-001")).toMatchObject({ status: "SUSPENDED", certification: "REVOKED" });
    });

    it("migrates forward, protects idempotency keys, and restores backups", () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-integration-migration-"));
        const path = join(root, "state.json");
        writeFileSync(path, JSON.stringify({ schemaVersion: 0, revision: 0, tenants: [] }));
        const migrations = new IntegrationStateMigrationRegistry();
        migrations.register(0, state => ({ ...state, schemaVersion: 1 }));
        const repository = new FileIntegrationStateRepository(path, migrations);
        const record = { organizationId: "ORG-001", key: "request-1", operation: "REGISTER_SYSTEM",
            requestHash: requestHash({ connectorId: "CONNECTOR-001" }), response: { accepted: true },
            recordedAt: new Date("2026-08-04T00:00:00.000Z") };
        repository.claimIdempotency(record);
        expect(() => repository.claimIdempotency({ ...record, requestHash: requestHash({ connectorId: "OTHER" }) }))
            .toThrow("different request");
        const backup = join(root, "backup.json");
        repository.backup(backup);
        repository.saveConnector("ORG-001", connector());
        const revisionBeforeRestore = repository.revision();
        repository.restore(backup);
        expect(repository.connectors("ORG-001")).toEqual([]);
        expect(repository.idempotency("ORG-001", "request-1")?.recordedAt).toBeInstanceOf(Date);
        expect(repository.revision()).toBe(revisionBeforeRestore + 1);
    });
});
