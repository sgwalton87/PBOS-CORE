import { describe, expect, it } from "vitest";
import {
    PbosApiRequest,
    PbosApiResponse,
    PbosConnectorClient,
    PbosConnectorTransport
} from "../../connector-sdk";
import { IdentityMapping } from "../../integration";
import { PbosV1Api } from "../index";
import { InMemoryIntegrationStateRepository } from "../../integration";

const connector = {
    connectorId: "PLAYBOOK-CONNECTOR-001",
    externalSystemId: "PLAYBOOK-SYSTEM-001",
    pbosSystemId: "PLAYBOOK-OS-001",
    name: "Playbook Platform",
    version: "1.0.0",
    domainIds: ["PLAYBOOK-DOMAIN-SCHOLAR"],
    capabilities: [{
        capabilityId: "PLAYBOOK-RUNTIME-HEALTH",
        name: "Runtime Health",
        type: "SERVICE" as const,
        version: "1.0.0",
        requiredPermissions: ["READ_RUNTIME_HEALTH"],
        inputSchemaId: "pbos.health.request.v1",
        outputSchemaId: "pbos.health.response.v1",
        active: true
    }],
    permissions: ["READ_RUNTIME_HEALTH", "PUBLISH_LIFECYCLE_EVENT", "USE_INTELLIGENCE", "EXCHANGE_APPROVED_DATA"],
    communicationRules: ["HEALTH_CHECK", "LIFECYCLE_EVENT", "INTELLIGENCE_REQUEST", "DATA_EXCHANGE"]
};

const domain = {
    registrationId: "PLAYBOOK-SCHOLAR-REGISTRATION-001",
    connectorId: connector.connectorId,
    externalSystemId: connector.externalSystemId,
    pbosSystemId: connector.pbosSystemId,
    domainId: "PLAYBOOK-DOMAIN-SCHOLAR",
    capabilityIds: ["PLAYBOOK-RUNTIME-HEALTH"],
    workflowIds: ["PLAYBOOK-SCHOLAR-ONBOARDING"],
    requiredServiceIds: ["PBOS-RUNTIME-HEALTH"],
    governanceRequirementIds: ["PBOS-AUTHORITY-BOUNDARY"]
};

const identity: IdentityMapping = {
    mappingId: "PLAYBOOK-IDENTITY-001",
    externalIdentity: {
        externalIdentityId: "supabase-user-001",
        externalSystemId: connector.externalSystemId,
        role: "SCHOLAR",
        authorityReferences: ["PLAYBOOK-SCHOLAR-AUTHORITY"],
        active: true
    },
    pbosIdentity: {
        actorId: "PLAYBOOK-ACTOR-001",
        systemId: connector.pbosSystemId,
        role: "SCHOLAR",
        authorityContext: ["PLAYBOOK-SCHOLAR-AUTHORITY"],
        provenance: "supabase-user-001",
        active: true
    },
    mappedAt: new Date()
};

function client(allowed = true, lifecycleAllowed = false, repository?: InMemoryIntegrationStateRepository): PbosConnectorClient {
    const api = new PbosV1Api(
        command => command.approvalId === "SYSTEM-APPROVAL-001",
        command => command.approvalId === "DOMAIN-APPROVAL-001",
        (actorId, action) => ({
            allowed,
            actorId,
            action,
            authorityId: allowed ? "PBOS-AUTHORITY-001" : undefined,
            reason: allowed ? "Governed permission granted." : "Governed permission denied."
        }), repository, "PLAYBOOK-ORG-001", () => lifecycleAllowed, {
            LIFECYCLE_EVENT: async payload => ({ accepted: true, payload }),
            INTELLIGENCE_REQUEST: async payload => ({ recommendation: payload }),
            DATA_EXCHANGE: async payload => ({ exchanged: payload })
        }
    );
    const transport: PbosConnectorTransport = {
        async send<TOutput>(request: PbosApiRequest): Promise<PbosApiResponse<TOutput>> {
            return await api.handle(request) as PbosApiResponse<TOutput>;
        }
    };
    return new PbosConnectorClient(transport);
}

async function activatePlaybook(sdk: PbosConnectorClient): Promise<void> {
    expect((await sdk.registerSystem(connector, "register-system")).success).toBe(true);
    expect((await sdk.certifySystem({
        connectorId: connector.connectorId,
        approvalId: "SYSTEM-APPROVAL-001",
        certifiedBy: "PBOS-CERTIFICATION-AUTHORITY"
    }, "certify-system")).success).toBe(true);
    expect((await sdk.registerDomain(domain, "register-domain")).success).toBe(true);
    expect((await sdk.activateDomain({
        registrationId: domain.registrationId,
        approvalId: "DOMAIN-APPROVAL-001"
    }, "activate-domain")).success).toBe(true);
    expect((await sdk.registerIdentity(identity, "register-identity")).success).toBe(true);
}

describe("PBOS v1 connector API", () => {
    it("registers and activates a governed Playbook system and Scholar domain", async () => {
        const sdk = client();
        await activatePlaybook(sdk);
        const health = await sdk.healthCheck({
            connectorId: connector.connectorId,
            domainRegistrationId: domain.registrationId,
            identityMappingId: identity.mappingId,
            purpose: "Verify Playbook connector readiness.",
            correlationId: "health-check"
        });
        expect(health.success).toBe(true);
        if (health.success) expect(health.provenance).toContain("HEALTH_CHECK");
    });

    it("denies connector self-certification without governance approval", async () => {
        const sdk = client();
        await sdk.registerSystem(connector, "register-system");
        const result = await sdk.certifySystem({
            connectorId: connector.connectorId,
            approvalId: "UNAPPROVED",
            certifiedBy: "external-application"
        }, "certify-system");
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.code).toBe("AUTHORITY_DENIED");
    });

    it("denies health communication when PBOS authority rejects the mapped actor", async () => {
        const sdk = client(false);
        await activatePlaybook(sdk);
        const result = await sdk.healthCheck({
            connectorId: connector.connectorId,
            domainRegistrationId: domain.registrationId,
            identityMappingId: identity.mappingId,
            purpose: "Attempt unauthorized health access.",
            correlationId: "denied-health"
        });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.code).toBe("AUTHORITY_DENIED");
    });

    it("operates the complete governed connector lifecycle and runtime API", async () => {
        const repository = new InMemoryIntegrationStateRepository();
        const sdk = client(true, true, repository);
        await activatePlaybook(sdk);
        expect((await sdk.connectorStatus({ connectorId: connector.connectorId }, "status")).success).toBe(true);
        const version = await sdk.negotiateVersion({ connectorId: connector.connectorId, supportedVersions: ["v1"] }, "version");
        expect(version.success).toBe(true);
        const capabilities = await sdk.discoverCapabilities({ connectorId: connector.connectorId,
            grantedPermissions: ["READ_RUNTIME_HEALTH"] }, "capabilities");
        expect(capabilities.success).toBe(true);
        const base = { connectorId: connector.connectorId, domainRegistrationId: domain.registrationId,
            identityMappingId: identity.mappingId, purpose: "Governed runtime operation", correlationId: "runtime",
            payload: { value: 1 } };
        expect((await sdk.publishLifecycleEvent(base, "lifecycle-1")).success).toBe(true);
        expect((await sdk.requestIntelligence({ ...base, correlationId: "intelligence" }, "intelligence-1")).success).toBe(true);
        expect((await sdk.exchangeApprovedData({ ...base, correlationId: "exchange", dataClassification: "PRIVATE",
            exchangeApprovalId: "exchange-approval" }, "exchange-1")).success).toBe(true);
        const audit = await sdk.queryAudit({ connectorId: connector.connectorId }, "audit");
        expect(audit.success).toBe(true);
        const lifecycle = { connectorId: connector.connectorId, approvalId: "lifecycle-approval", actorId: "operator",
            reason: "Governed lifecycle test" };
        expect((await sdk.suspendSystem(lifecycle, "suspend", "suspend-1")).success).toBe(true);
        expect((await sdk.suspendSystem(lifecycle, "suspend-replay", "suspend-1")).success).toBe(true);
        expect((await sdk.resumeSystem(lifecycle, "resume", "resume-1")).success).toBe(true);
        expect((await sdk.deactivateDomain({ registrationId: domain.registrationId, approvalId: "domain-approval",
            actorId: "operator", reason: "Lifecycle test" }, "deactivate", "domain-1")).success).toBe(true);
        expect((await sdk.revokeSystem(lifecycle, "revoke", "revoke-1")).success).toBe(true);
    });

    it("rejects unsupported API version negotiation and unapproved lifecycle changes", async () => {
        const sdk = client();
        await activatePlaybook(sdk);
        const version = await sdk.negotiateVersion({ connectorId: connector.connectorId, supportedVersions: ["v2"] }, "version");
        expect(version.success).toBe(false);
        if (!version.success) expect(version.error.code).toBe("UNSUPPORTED_VERSION");
        const denied = await sdk.suspendSystem({ connectorId: connector.connectorId, approvalId: "self", actorId: "application",
            reason: "Self-authorize" }, "suspend", "suspend-denied");
        expect(denied.success).toBe(false);
        if (!denied.success) expect(denied.error.code).toBe("AUTHORITY_DENIED");
    });
});
