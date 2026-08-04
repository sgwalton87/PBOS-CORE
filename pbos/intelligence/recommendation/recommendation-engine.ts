import { randomUUID } from "crypto";
import { IntelligenceRequest } from "../contracts/intelligence-request";
import { ReasoningResult } from "../reasoning/reasoning-result";
import { RecommendationModel } from "./recommendation-model";

export class RecommendationEngine {
    recommend(request: IntelligenceRequest, reasoning: ReasoningResult): readonly RecommendationModel[] {
        if (reasoning.requestId !== request.requestId) throw new Error("Reasoning provenance does not match the intelligence request.");
        const candidates = request.input.candidateActions;
        if (!Array.isArray(candidates) || !candidates.every(action => typeof action === "string")) return [];
        return candidates.map((action, index) => ({
            recommendationId: randomUUID(),
            action,
            rank: index + 1,
            confidence: reasoning.confidence,
            supportingEvidence: reasoning.provenance,
            explanation: reasoning.explanation.join(" "),
            status: "REQUIRES_HUMAN_APPROVAL"
        }));
    }
}
