import { AuthorizationDecision } from "../../kernel";

export interface FactoryPolicy {
    readonly policyId: string;
    readonly allowedCreatorIds: readonly string[];
    readonly requiredApproval: boolean;
    readonly evolutionRequiresCertification: boolean;
}

export class FactoryPolicyEvaluator {
    authorizeCreation(policy: FactoryPolicy, creatorId: string, authority: AuthorizationDecision, approvalId?: string): void {
        if (!authority.allowed || authority.actorId !== creatorId || !policy.allowedCreatorIds.includes(creatorId)) {
            throw new Error("System creation denied by factory policy.");
        }
        if (policy.requiredApproval && !approvalId) throw new Error("System creation requires explicit approval.");
    }
}
