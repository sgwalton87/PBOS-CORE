import { describe, expect, it } from "vitest";
import { PbosApiResponse, PbosConnectorClient, PbosConnectorTransport } from "../../connector-sdk";
import { IdentityMapping } from "../../integration";
import { PbosV1Api } from "../index";

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
    permissions: ["READ_RUNTIME_HEALTH"],
    communicationRules: ["HEALTH_CHECK"]
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
        provenance: ["supabase-user-001"],
        active: true
    },
    mappedAt: new Date()
};

function client(allowed = true): PbosConnectorClient {
    const api = new PbosV1Api(
        command => command.approvalId === "SYSTEM-APPROVAL-001",
        command => command.approvalId === "DOMAIN-APPROVAL-001",
        (actorId, action) => ({
            allowed,
            actorId,
            action,
            authorityId: allowed ? "PBOS-AUTHORITY-001" : undefined,
            reason: allowed ? "Governed permission granted." : "Governed permission denied."
        })
    );
    const transport: PbosConnectorTransport = {
        async send<TOutput>(request): Promise<PbosApiResponse<TOutput>> {
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
});
