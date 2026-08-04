export interface EvolutionProposal {
    readonly proposalId: string;
    readonly systemId: string;
    readonly opportunityIds: readonly string[];
    readonly proposedChanges: readonly string[];
    readonly expectedOutcomes: Readonly<Record<string, unknown>>;
    readonly risks: readonly string[];
    readonly rollbackPlan: readonly string[];
    readonly provenance: readonly string[];
    readonly status: "PROPOSED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
    readonly createdAt: Date;
}
