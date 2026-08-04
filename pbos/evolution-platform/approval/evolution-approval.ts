import { randomUUID } from "crypto";
import { AuthorizationDecision } from "../../kernel";
import { EvolutionProposal } from "../proposals/evolution-proposal";

export interface EvolutionApproval {
    readonly approvalId: string;
    readonly proposalId: string;
    readonly reviewerId: string;
    readonly authorityId: string;
    readonly decision: "APPROVED" | "REJECTED";
    readonly rationale: string;
    readonly decidedAt: Date;
}

export class EvolutionApprovalManager {
    decide(
        proposal: EvolutionProposal,
        reviewerId: string,
        authority: AuthorizationDecision,
        decision: EvolutionApproval["decision"],
        rationale: string
    ): EvolutionApproval {
        if (!authority.allowed || authority.actorId !== reviewerId || authority.action !== "APPROVE_EVOLUTION" || !authority.authorityId) {
            throw new Error("Evolution approval denied by governance boundary.");
        }
        if (!rationale) throw new Error("Evolution approval requires an auditable rationale.");
        return {
            approvalId: randomUUID(), proposalId: proposal.proposalId, reviewerId,
            authorityId: authority.authorityId, decision, rationale, decidedAt: new Date()
        };
    }
}
