export type AuthorityMode = "READ_ONLY" | "HUMAN_GATED" | "DELEGATED_AUTONOMY";
export type ActionRisk = "LOW" | "MEDIUM" | "HIGH" | "IRREVERSIBLE";

export type BuildAction =
    | "INSPECT_REPOSITORY"
    | "READ_SYSTEM_STATUS"
    | "CREATE_BUILD_PLAN"
    | "PROPOSE_CHANGE"
    | "MODIFY_APPLICATION_CODE"
    | "CREATE_TESTS"
    | "UPDATE_DOCUMENTATION"
    | "CREATE_COMMIT"
    | "PUSH_BRANCH"
    | "OPEN_DRAFT_PR"
    | "RUN_VALIDATION"
    | "MERGE_MAIN"
    | "DEPLOY_PRODUCTION"
    | "DESTRUCTIVE_MIGRATION"
    | "MANAGE_SECRETS"
    | "CERTIFY_SYSTEM"
    | "CROSS_REPOSITORY_CHANGE";

export const PROTECTED_BUILD_ACTIONS: readonly BuildAction[] = [
    "MERGE_MAIN",
    "DEPLOY_PRODUCTION",
    "DESTRUCTIVE_MIGRATION",
    "MANAGE_SECRETS",
    "CERTIFY_SYSTEM",
    "CROSS_REPOSITORY_CHANGE"
];

export interface AutonomousBuildGrant {
    readonly grantId: string;
    readonly systemId: string;
    readonly repository: string;
    readonly branchPattern: string;
    readonly mode: AuthorityMode;
    readonly allowedActions: readonly BuildAction[];
    readonly deniedActions: readonly BuildAction[];
    readonly maximumRisk: ActionRisk;
    readonly issuedBy: string;
    readonly issuanceApprovalId: string;
    readonly issuedAt: Date;
    readonly expiresAt: Date;
    readonly revokedAt?: Date;
    readonly revocationReason?: string;
}

export interface BuildAuthorityRequest {
    readonly grantId: string;
    readonly systemId: string;
    readonly repository: string;
    readonly branch: string;
    readonly action: BuildAction;
    readonly risk: ActionRisk;
    readonly explicitApprovalId?: string;
    readonly requestedAt: Date;
}

export interface BuildAuthorityDecision {
    readonly decisionId: string;
    readonly grantId: string;
    readonly action: BuildAction;
    readonly allowed: boolean;
    readonly reason: string;
    readonly explicitApprovalId?: string;
    readonly decidedAt: Date;
}

export interface BuildGrantRequest {
    readonly systemId: string;
    readonly repository: string;
    readonly branchPattern: string;
    readonly mode: AuthorityMode;
    readonly allowedActions: readonly BuildAction[];
    readonly deniedActions?: readonly BuildAction[];
    readonly maximumRisk: ActionRisk;
    readonly issuedBy: string;
    readonly issuanceApprovalId: string;
    readonly durationMinutes: number;
}
