import { IdentityMapping, DomainRegistration, SystemConnector } from "../integration";
import { ConnectorRegistrationManifest, DomainRegistrationManifest } from "../connector-sdk";

const registeredAt = new Date("2026-08-04T00:00:00.000Z");

export const PLAYBOOK_CONNECTOR_MANIFEST: ConnectorRegistrationManifest = {
    connectorId: "PLAYBOOK-CONNECTOR-001",
    externalSystemId: "PLAYBOOK-SYSTEM-001",
    pbosSystemId: "PLAYBOOK-OS-001",
    name: "The Playbook PBOS Connector",
    version: "1.0.0",
    domainIds: ["PLAYBOOK-DOMAIN-SCHOLAR"],
    capabilities: [
        {
            capabilityId: "PLAYBOOK-SCHOLAR-JOURNEY",
            name: "Scholar Journey",
            type: "WORKFLOW",
            version: "1.0.0",
            requiredPermissions: ["PUBLISH_LIFECYCLE_EVENT", "EXCHANGE_APPROVED_DATA"],
            inputSchemaId: "playbook.scholar.onboarding.v1",
            outputSchemaId: "playbook.scholar.dashboard.v1",
            active: true
        },
        {
            capabilityId: "PLAYBOOK-RUNTIME-HEALTH",
            name: "Runtime Health",
            type: "SERVICE",
            version: "1.0.0",
            requiredPermissions: ["READ_RUNTIME_HEALTH"],
            inputSchemaId: "pbos.health.request.v1",
            outputSchemaId: "pbos.health.response.v1",
            active: true
        }
    ],
    permissions: ["READ_RUNTIME_HEALTH", "PUBLISH_LIFECYCLE_EVENT", "EXCHANGE_APPROVED_DATA"],
    communicationRules: ["HEALTH_CHECK", "LIFECYCLE_EVENT", "DATA_EXCHANGE", "PROVENANCE_REQUIRED"]
};

export const PLAYBOOK_CONNECTOR: SystemConnector = {
    ...PLAYBOOK_CONNECTOR_MANIFEST,
    status: "ACTIVE",
    certification: "CERTIFIED",
    registeredAt
};

export const PLAYBOOK_DOMAIN_MANIFEST: DomainRegistrationManifest = {
    registrationId: "PLAYBOOK-SCHOLAR-REGISTRATION-001",
    connectorId: PLAYBOOK_CONNECTOR.connectorId,
    externalSystemId: PLAYBOOK_CONNECTOR.externalSystemId,
    pbosSystemId: PLAYBOOK_CONNECTOR.pbosSystemId,
    domainId: "PLAYBOOK-DOMAIN-SCHOLAR",
    capabilityIds: PLAYBOOK_CONNECTOR.capabilities.map(capability => capability.capabilityId),
    workflowIds: ["PLAYBOOK-SCHOLAR-ONBOARDING"],
    requiredServiceIds: ["PBOS-IDENTITY", "PBOS-AUTHORITY", "PBOS-RUNTIME"],
    governanceRequirementIds: ["PBOS-AUTHORITY-BOUNDARY", "PROVENANCE-REQUIRED"]
};

export const PLAYBOOK_DOMAIN_REGISTRATION: DomainRegistration = {
    ...PLAYBOOK_DOMAIN_MANIFEST,
    status: "ACTIVE",
    registeredAt,
    updatedAt: registeredAt
};

export function playbookSupabaseIdentity(
    supabaseUserId: string,
    actorId = `PLAYBOOK-ACTOR-${supabaseUserId}`
): IdentityMapping {
    if (!supabaseUserId.trim()) throw new Error("A Supabase user ID is required for Playbook identity mapping.");
    return {
        mappingId: `PLAYBOOK-IDENTITY-${supabaseUserId}`,
        externalIdentity: {
            externalIdentityId: supabaseUserId,
            externalSystemId: PLAYBOOK_CONNECTOR.externalSystemId,
            role: "SCHOLAR",
            authorityReferences: ["PLAYBOOK-SCHOLAR-AUTHORITY"],
            active: true
        },
        pbosIdentity: {
            actorId,
            systemId: PLAYBOOK_CONNECTOR.pbosSystemId,
            role: "SCHOLAR",
            authorityContext: ["PLAYBOOK-SCHOLAR-AUTHORITY"],
            provenance: supabaseUserId,
            active: true
        },
        mappedAt: new Date()
    };
}
