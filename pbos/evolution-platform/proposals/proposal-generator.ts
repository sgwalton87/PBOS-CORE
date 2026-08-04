import { randomUUID } from "crypto";
import { ImprovementOpportunity } from "../discovery/improvement-opportunity";
import { EvolutionProposal } from "./evolution-proposal";

export class ProposalGenerator {
    generate(
        systemId: string,
        opportunities: readonly ImprovementOpportunity[],
        proposedChanges: readonly string[],
        expectedOutcomes: Readonly<Record<string, unknown>>,
        risks: readonly string[],
        rollbackPlan: readonly string[]
    ): EvolutionProposal {
        if (opportunities.length === 0 || proposedChanges.length === 0) throw new Error("Evolution proposals require evidence and proposed changes.");
        if (rollbackPlan.length === 0) throw new Error("Evolution proposals require a rollback plan.");
        if (opportunities.some(opportunity => opportunity.systemId !== systemId)) throw new Error("Cross-system evolution proposal denied.");
        return {
            proposalId: randomUUID(), systemId,
            opportunityIds: opportunities.map(opportunity => opportunity.opportunityId),
            proposedChanges, expectedOutcomes, risks, rollbackPlan,
            provenance: opportunities.flatMap(opportunity => opportunity.observationIds),
            status: "PROPOSED", createdAt: new Date()
        };
    }
}
