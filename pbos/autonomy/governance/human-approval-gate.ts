import { AuthorizationDecision } from "../../kernel";
import { PlanModel } from "../planning/plan-model";

export type ApprovalDisposition = "APPROVED" | "DENIED" | "ESCALATION_REQUIRED";

export interface PlanApproval {
    readonly planId: string;
    readonly disposition: ApprovalDisposition;
    readonly authorityId?: string;
    readonly humanApprovalId?: string;
    readonly reason: string;
    readonly decidedAt: Date;
}

export class HumanApprovalGate {
    evaluate(plan: PlanModel, authority: AuthorizationDecision, humanApprovalId?: string): PlanApproval {
        if (!authority.allowed) return {
            planId: plan.planId, disposition: "DENIED", reason: authority.reason, decidedAt: new Date()
        };
        const requiresHuman = plan.actions.some(action => action.risk === "HIGH" || action.risk === "IRREVERSIBLE");
        if (requiresHuman && !humanApprovalId) return {
            planId: plan.planId, disposition: "ESCALATION_REQUIRED", authorityId: authority.authorityId,
            reason: "High-risk or irreversible actions require explicit human approval.", decidedAt: new Date()
        };
        return {
            planId: plan.planId, disposition: "APPROVED", authorityId: authority.authorityId,
            humanApprovalId, reason: requiresHuman ? "Human approval recorded." : "Governed authority permits execution.",
            decidedAt: new Date()
        };
    }
}
