export interface RecommendationModel {
    readonly recommendationId: string;
    readonly action: string;
    readonly rank: number;
    readonly confidence: number;
    readonly supportingEvidence: readonly string[];
    readonly explanation: string;
    readonly status: "REQUIRES_HUMAN_APPROVAL";
}
