import {
    DomainRegistration,
    IdentityMapping,
    RuntimeCommunicationResponse,
    SystemConnector
} from "../integration";

export const PBOS_API_VERSION = "v1" as const;

export type PbosApiOperation =
    | "REGISTER_SYSTEM"
    | "CERTIFY_SYSTEM"
    | "REGISTER_DOMAIN"
    | "ACTIVATE_DOMAIN"
    | "REGISTER_IDENTITY"
    | "HEALTH_CHECK"
    | "GET_CONNECTOR_STATUS"
    | "SUSPEND_SYSTEM"
    | "RESUME_SYSTEM"
    | "REVOKE_SYSTEM"
    | "NEGOTIATE_VERSION"
    | "GET_DOMAIN_STATUS"
    | "DEACTIVATE_DOMAIN"
    | "DISCOVER_CAPABILITIES"
    | "PUBLISH_LIFECYCLE_EVENT"
    | "REQUEST_INTELLIGENCE"
    | "EXCHANGE_APPROVED_DATA"
    | "QUERY_AUDIT";

export interface ConnectorRegistrationManifest {
    readonly connectorId: string;
    readonly externalSystemId: string;
    readonly pbosSystemId: string;
    readonly name: string;
    readonly version: string;
    readonly domainIds: readonly string[];
    readonly capabilities: SystemConnector["capabilities"];
    readonly permissions: readonly string[];
    readonly communicationRules: readonly string[];
}

export interface DomainRegistrationManifest {
    readonly registrationId: string;
    readonly connectorId: string;
    readonly externalSystemId: string;
    readonly pbosSystemId: string;
    readonly domainId: string;
    readonly capabilityIds: readonly string[];
    readonly workflowIds: readonly string[];
    readonly requiredServiceIds: readonly string[];
    readonly governanceRequirementIds: readonly string[];
}

export interface SystemCertificationCommand {
    readonly connectorId: string;
    readonly approvalId: string;
    readonly certifiedBy: string;
}

export interface DomainActivationCommand {
    readonly registrationId: string;
    readonly approvalId: string;
}

export interface HealthCheckCommand {
    readonly connectorId: string;
    readonly domainRegistrationId: string;
    readonly identityMappingId: string;
    readonly purpose: string;
    readonly correlationId: string;
}

export interface ConnectorStatusCommand { readonly connectorId: string; }
export interface ConnectorLifecycleCommand extends ConnectorStatusCommand {
    readonly approvalId: string;
    readonly actorId: string;
    readonly reason: string;
}
export interface VersionNegotiationCommand extends ConnectorStatusCommand { readonly supportedVersions: readonly string[]; }
export interface DomainStatusCommand { readonly registrationId: string; }
export interface DomainDeactivationCommand extends DomainStatusCommand {
    readonly approvalId: string;
    readonly actorId: string;
    readonly reason: string;
}
export interface CapabilityDiscoveryCommand extends ConnectorStatusCommand { readonly grantedPermissions: readonly string[]; }
export interface RuntimeOperationCommand {
    readonly connectorId: string;
    readonly domainRegistrationId: string;
    readonly identityMappingId: string;
    readonly purpose: string;
    readonly correlationId: string;
    readonly payload: unknown;
    readonly dataClassification?: string;
    readonly exchangeApprovalId?: string;
}
export interface AuditQueryCommand extends ConnectorStatusCommand { readonly correlationId?: string; readonly limit?: number; }

export interface PbosApiRequest<T = unknown> {
    readonly apiVersion: typeof PBOS_API_VERSION;
    readonly operation: PbosApiOperation;
    readonly correlationId: string;
    readonly payload: T;
    readonly idempotencyKey?: string;
}

export interface PbosApiSuccess<T = unknown> {
    readonly success: true;
    readonly apiVersion: typeof PBOS_API_VERSION;
    readonly correlationId: string;
    readonly output: T;
    readonly provenance: readonly string[];
}

export interface PbosApiFailure {
    readonly success: false;
    readonly apiVersion: typeof PBOS_API_VERSION;
    readonly correlationId: string;
    readonly error: {
        readonly code: "INVALID_REQUEST" | "NOT_FOUND" | "AUTHORITY_DENIED" | "CONFLICT" | "UNSUPPORTED_VERSION" | "RATE_LIMITED";
        readonly message: string;
    };
}

export type PbosApiResponse<T = unknown> = PbosApiSuccess<T> | PbosApiFailure;

export type SystemRegistrationResponse = SystemConnector;
export type DomainRegistrationResponse = DomainRegistration;
export type IdentityRegistrationResponse = IdentityMapping;
export type HealthCheckResponse = RuntimeCommunicationResponse<Readonly<{
    healthy: boolean;
    connectorId: string;
    pbosSystemId: string;
    checkedAt: Date;
}>>;
