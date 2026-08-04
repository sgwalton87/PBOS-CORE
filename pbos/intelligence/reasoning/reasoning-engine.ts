import { IntelligenceRequest } from "../contracts/intelligence-request";
import { ReasoningResult } from "./reasoning-result";

export class ReasoningEngine {
    reason(request: IntelligenceRequest): ReasoningResult {
        if (request.context.sources.length === 0) throw new Error("Reasoning requires approved context sources.");
        const observations = request.context.sources.map(source =>
            `${source.sourceType}:${source.sourceId} is available for ${request.purpose}.`
        );
        const confidence = request.context.sources.reduce((score, source) => score + (source.approved ? 1 : 0), 0)
            / request.context.sources.length;
        return {
            requestId: request.requestId,
            observations,
            conclusions: [`Capability ${request.capabilityId} may evaluate the supplied approved context.`],
            confidence,
            explanation: [
                `${request.context.sources.length} approved source(s) were evaluated.`,
                "No final human decision was made."
            ],
            provenance: request.context.provenance,
            generatedAt: new Date()
        };
    }
}
