import { DomainRegistration, SystemConnector } from "../integration";

const registeredAt = new Date("2026-08-03T00:00:00.000Z");

export const BULLETPROOF_CONNECTOR: SystemConnector = {
    connectorId: "BULLETPROOF-CONNECTOR-001",
    externalSystemId: "BULLETPROOF-SYSTEM-001",
    pbosSystemId: "BULLETPROOF-OS-001",
    name: "Bulletproof Beneficiary PBOS Connector",
    version: "1.0.0",
    domainIds: ["PBOS-DOMAIN-LEGACY-PLANNING-001"],
    capabilities: [
        { capabilityId: "ACCOUNT_IDENTITY", name: "Account Identity", type: "SERVICE", version: "1.0.0", requiredPermissions: ["identity:self"], inputSchemaId: "pbos.identity.account.v1", outputSchemaId: "pbos.identity.account.v1", active: true },
        { capabilityId: "BENEFICIARY_SEARCH", name: "Beneficiary Search", type: "WORKFLOW", version: "1.0.0", requiredPermissions: ["search:create", "search:read-own"], inputSchemaId: "legacy.search.request.v1", outputSchemaId: "legacy.search.status.v1", active: true },
        { capabilityId: "SECURE_DOCUMENT", name: "Secure Document", type: "SERVICE", version: "1.0.0", requiredPermissions: ["document:create", "document:read-own"], inputSchemaId: "legacy.document.metadata.v1", outputSchemaId: "legacy.document.reference.v1", active: true }
    ],
    permissions: ["identity:self", "search:create", "search:read-own", "document:create", "document:read-own"],
    communicationRules: ["TLS_REQUIRED", "SIGNED_IDENTITY_REQUIRED", "PROVENANCE_REQUIRED", "NO_RAW_DOCUMENT_EXCHANGE"],
    status: "ACTIVE",
    certification: "CERTIFIED",
    registeredAt
};

export const BULLETPROOF_DOMAIN_REGISTRATION: DomainRegistration = {
    registrationId: "BULLETPROOF-LEGACY-DOMAIN-001",
    connectorId: BULLETPROOF_CONNECTOR.connectorId,
    externalSystemId: BULLETPROOF_CONNECTOR.externalSystemId,
    pbosSystemId: BULLETPROOF_CONNECTOR.pbosSystemId,
    domainId: "PBOS-DOMAIN-LEGACY-PLANNING-001",
    capabilityIds: BULLETPROOF_CONNECTOR.capabilities.map(capability => capability.capabilityId),
    workflowIds: ["ACCOUNT-TO-BENEFICIARY-SEARCH-001"],
    requiredServiceIds: ["PBOS-IDENTITY", "PBOS-AUTHORITY", "PBOS-EVIDENCE", "PBOS-SECURE-DOCUMENT"],
    governanceRequirementIds: ["EXPLICIT-VERIFICATION-APPROVAL", "ROW-LEVEL-ACCESS", "IMMUTABLE-AUDIT"],
    status: "ACTIVE",
    registeredAt,
    updatedAt: registeredAt
};
