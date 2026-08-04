import { describe, expect, it } from "vitest";
import {
    CapabilityDiscovery, ConnectedSystemRegistry, DomainRegistrationRegistry, IdentityMapper,
    RuntimeCommunicationBoundary, SystemAdapter, SystemConnector
} from "../index";

const connector: SystemConnector = {
    connectorId: "connector", externalSystemId: "external-system", pbosSystemId: "pbos-system",
    name: "External Connector", version: "1.0.0", domainIds: ["domain"],
    capabilities: [{
        capabilityId: "workflow", name: "Workflow", type: "WORKFLOW", version: "1.0.0",
        requiredPermissions: ["INVOKE_WORKFLOW"], inputSchemaId: "input-v1", outputSchemaId: "output-v1", active: true
    }],
    permissions: ["INVOKE_WORKFLOW"], communicationRules: ["REQUEST_RESPONSE"],
    status: "ACTIVE", certification: "CERTIFIED", registeredAt: new Date()
};

describe("PBOS Ecosystem Integration Architecture", () => {
    it("registers independent versioned connectors", () => {
        const registry = new ConnectedSystemRegistry();
        registry.register(connector);
        expect(registry.get("connector")?.externalSystemId).toBe("external-system");
        expect(registry.forDomain("domain")).toHaveLength(1);
        expect(() => registry.register({ ...connector, connectorId: "duplicate" })).toThrow("version already registered");
    });

    it("maps external identities while preserving authority and provenance", () => {
        const mapper = new IdentityMapper();
        mapper.map({
            mappingId: "mapping",
            externalIdentity: {
                externalIdentityId: "external-actor", externalSystemId: "external-system",
                role: "operator", authorityReferences: ["authority"], active: true
            },
            pbosIdentity: {
                actorId: "pbos-actor", systemId: "pbos-system", role: "operator",
                authorityContext: ["authority"], provenance: "connector:external-actor", active: true
            },
            mappedAt: new Date()
        });
        expect(mapper.forExternalIdentity("external-actor")[0].pbosIdentity.actorId).toBe("pbos-actor");
    });

    it("discovers only active capabilities permitted to the caller", () => {
        const discovery = new CapabilityDiscovery();
        expect(discovery.discover(connector, ["INVOKE_WORKFLOW"])).toHaveLength(1);
        expect(discovery.discover(connector, [])).toEqual([]);
    });

    it("translates governed requests without merging application logic", () => {
        const adapter = new SystemAdapter(connector, input => ({ wrapped: input }), output => output);
        const translated = adapter.translateRequest({
            requestId: "request", connectorId: "connector", capabilityId: "workflow", actorId: "actor",
            authority: { allowed: true, actorId: "actor", action: "INVOKE_WORKFLOW", authorityId: "authority", reason: "permitted" },
            payload: { value: 1 }, correlationId: "correlation", provenance: ["external-system"], requestedAt: new Date()
        });
        expect(translated.payload).toEqual({ wrapped: { value: 1 } });
        expect(translated.provenance).toEqual(["external-system", "connector"]);
    });

    it("fails closed for uncertified connectors and unknown authority", () => {
        const uncertified = new SystemAdapter({ ...connector, certification: "PENDING" }, input => input, output => output);
        const request = {
            requestId: "request", connectorId: "connector", capabilityId: "workflow", actorId: "actor",
            authority: { allowed: false, actorId: "actor", action: "INVOKE_WORKFLOW", reason: "unknown" },
            payload: {}, correlationId: "correlation", provenance: [], requestedAt: new Date()
        };
        expect(() => uncertified.translateRequest(request)).toThrow("not active and certified");
        const certified = new SystemAdapter(connector, input => input, output => output);
        expect(() => certified.translateRequest(request)).toThrow("authority or permission boundary");
    });

    it("registers domain capabilities, workflows, services, and governance requirements", () => {
        const systems = new ConnectedSystemRegistry();
        systems.register(connector);
        const domains = new DomainRegistrationRegistry(systems);
        domains.register({
            registrationId: "domain-registration", connectorId: "connector",
            externalSystemId: "external-system", pbosSystemId: "pbos-system", domainId: "domain",
            capabilityIds: ["workflow"], workflowIds: ["domain-workflow"],
            requiredServiceIds: ["runtime-service"], governanceRequirementIds: ["governance-policy"],
            status: "ACTIVE", registeredAt: new Date(), updatedAt: new Date()
        });
        expect(domains.get("domain-registration")?.requiredServiceIds).toEqual(["runtime-service"]);
        expect(() => domains.register({
            ...domains.get("domain-registration")!, registrationId: "invalid", capabilityIds: ["unknown"]
        })).toThrow("unknown connector capability");
    });

    it("enforces governed runtime communication and approved data exchange", async () => {
        const runtimeConnector: SystemConnector = {
            ...connector,
            permissions: [
                ...connector.permissions,
                "PUBLISH_LIFECYCLE_EVENT", "READ_RUNTIME_HEALTH", "USE_INTELLIGENCE", "EXCHANGE_APPROVED_DATA"
            ],
            communicationRules: ["LIFECYCLE_EVENT", "HEALTH_CHECK", "INTELLIGENCE_REQUEST", "DATA_EXCHANGE"]
        };
        const systems = new ConnectedSystemRegistry();
        systems.register(runtimeConnector);
        const domains = new DomainRegistrationRegistry(systems);
        domains.register({
            registrationId: "domain-registration", connectorId: "connector",
            externalSystemId: "external-system", pbosSystemId: "pbos-system", domainId: "domain",
            capabilityIds: ["workflow"], workflowIds: [], requiredServiceIds: [], governanceRequirementIds: ["policy"],
            status: "ACTIVE", registeredAt: new Date(), updatedAt: new Date()
        });
        const boundary = new RuntimeCommunicationBoundary(systems, domains, {
            HEALTH_CHECK: async () => ({ healthy: true }),
            DATA_EXCHANGE: async payload => payload
        });
        const base = {
            communicationId: "communication", connectorId: "connector", domainRegistrationId: "domain-registration",
            actorId: "actor", payload: {}, purpose: "Check governed runtime health",
            correlationId: "correlation", provenance: ["external-system"], requestedAt: new Date()
        };
        const health = await boundary.communicate({
            ...base, type: "HEALTH_CHECK",
            authority: { allowed: true, actorId: "actor", action: "READ_RUNTIME_HEALTH", authorityId: "authority", reason: "permitted" }
        });
        expect(health.output).toEqual({ healthy: true });
        await expect(boundary.communicate({
            ...base, type: "DATA_EXCHANGE",
            authority: { allowed: true, actorId: "actor", action: "EXCHANGE_APPROVED_DATA", authorityId: "authority", reason: "permitted" }
        })).rejects.toThrow("approval and classification");
        expect(boundary.history("connector")).toHaveLength(1);
    });
});
