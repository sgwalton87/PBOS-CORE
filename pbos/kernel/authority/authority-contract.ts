export interface KernelAuthorityContract {
    readonly authorityId: string;
    readonly actorId: string;
    readonly systemId: string;
    readonly allowedActions: readonly string[];
    readonly governanceDecisionIds: readonly string[];
    readonly active: boolean;
}

export interface AuthorizationDecision {
    readonly allowed: boolean;
    readonly actorId: string;
    readonly action: string;
    readonly authorityId?: string;
    readonly reason: string;
}
