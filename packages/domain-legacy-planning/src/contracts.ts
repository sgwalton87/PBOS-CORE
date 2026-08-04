export type LegacyPlanningRole = "MEMBER" | "BENEFICIARY" | "AUTHORIZED_REPRESENTATIVE" | "VERIFIER" | "SYSTEM_OPERATOR";
export type LegacyPlanningCapability = "ACCOUNT_IDENTITY" | "IDENTITY_VERIFICATION" | "BENEFICIARY_SEARCH" | "SEARCH_TRACKING" | "LEGACY_POLICY_RECORD" | "SECURE_DOCUMENT";
export type LegacyPlanningAction = "CREATE" | "READ_OWN" | "READ_AUTHORIZED" | "UPDATE_OWN" | "VERIFY" | "ADMINISTER";
export type SearchStatus = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "MATCH_FOUND" | "NO_MATCH" | "CLOSED";

export interface DomainAuthorityRule {
    readonly role: LegacyPlanningRole;
    readonly capability: LegacyPlanningCapability;
    readonly actions: readonly LegacyPlanningAction[];
    readonly humanApprovalRequired: boolean;
}

export interface LegacyPlanningEvent {
    readonly eventId: string;
    readonly systemId: string;
    readonly actorId: string;
    readonly subjectId: string;
    readonly type: string;
    readonly occurredAt: Date;
    readonly provenance: readonly string[];
}

export interface BeneficiarySearchRequest {
    readonly requestId: string;
    readonly memberId: string;
    readonly beneficiaryName: string;
    readonly relationship: string;
    readonly status: SearchStatus;
    readonly submittedAt?: Date;
    readonly provenance: readonly string[];
}
