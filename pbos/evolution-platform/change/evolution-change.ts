import { randomUUID } from "crypto";
import { EvolutionApproval } from "../approval/evolution-approval";
import { EvolutionProposal } from "../proposals/evolution-proposal";

export interface EvolutionChange {
    readonly changeId: string;
    readonly proposalId: string;
    readonly approvalId: string;
    readonly systemId: string;
    readonly previousVersion: string;
    readonly nextVersion: string;
    readonly lineage: readonly string[];
    readonly rollbackAvailable: boolean;
    readonly status: "IMPLEMENTED" | "ROLLED_BACK" | "FAILED";
    readonly implementedAt: Date;
    readonly rolledBackAt?: Date;
}

export class EvolutionChangeManager {
    async implement(
        proposal: EvolutionProposal,
        approval: EvolutionApproval,
        previousVersion: string,
        nextVersion: string,
        apply: () => Promise<void>
    ): Promise<EvolutionChange> {
        if (approval.proposalId !== proposal.proposalId || approval.decision !== "APPROVED") {
            throw new Error("Evolution implementation requires matching approval.");
        }
        if (previousVersion === nextVersion) throw new Error("Evolution change requires a new version.");
        try {
            await apply();
            return {
                changeId: randomUUID(), proposalId: proposal.proposalId, approvalId: approval.approvalId,
                systemId: proposal.systemId, previousVersion, nextVersion,
                lineage: [...proposal.provenance, proposal.proposalId, approval.approvalId],
                rollbackAvailable: proposal.rollbackPlan.length > 0,
                status: "IMPLEMENTED", implementedAt: new Date()
            };
        } catch {
            return {
                changeId: randomUUID(), proposalId: proposal.proposalId, approvalId: approval.approvalId,
                systemId: proposal.systemId, previousVersion, nextVersion,
                lineage: [...proposal.provenance, proposal.proposalId, approval.approvalId],
                rollbackAvailable: proposal.rollbackPlan.length > 0,
                status: "FAILED", implementedAt: new Date()
            };
        }
    }

    async rollback(change: EvolutionChange, restore: () => Promise<void>): Promise<EvolutionChange> {
        if (change.status !== "IMPLEMENTED" || !change.rollbackAvailable) throw new Error("Evolution change is not eligible for rollback.");
        await restore();
        return { ...change, status: "ROLLED_BACK", rolledBackAt: new Date() };
    }
}
