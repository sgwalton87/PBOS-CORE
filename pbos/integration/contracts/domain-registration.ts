export type DomainRegistrationStatus = "REGISTERED" | "ACTIVE" | "SUSPENDED" | "REVOKED";

export interface DomainRegistration {
    readonly registrationId: string;
    readonly connectorId: string;
    readonly externalSystemId: string;
    readonly pbosSystemId: string;
    readonly domainId: string;
    readonly capabilityIds: readonly string[];
    readonly workflowIds: readonly string[];
    readonly requiredServiceIds: readonly string[];
    readonly governanceRequirementIds: readonly string[];
    readonly status: DomainRegistrationStatus;
    readonly registeredAt: Date;
    readonly updatedAt: Date;
}
