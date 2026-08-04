import { randomUUID } from "crypto";
import { SystemObservation } from "../observation/system-observation";
import { ImprovementOpportunity } from "./improvement-opportunity";

export class ImprovementDetector {
    detect(observations: readonly SystemObservation[]): readonly ImprovementOpportunity[] {
        return observations.flatMap(observation => {
            const range = observation.expectedRange;
            if (!range || (observation.value >= range.minimum && observation.value <= range.maximum)) return [];
            const below = observation.value < range.minimum;
            return [{
                opportunityId: randomUUID(), systemId: observation.systemId,
                observationIds: [observation.observationId],
                category: observation.signalType === "HEALTH" ? "FAILURE" : below ? "INEFFICIENCY" : "OPTIMIZATION",
                description: `${observation.metric} is outside its governed expected range.`,
                severity: observation.signalType === "HEALTH" ? "HIGH" : "MEDIUM",
                confidence: 1, detectedAt: new Date()
            } satisfies ImprovementOpportunity];
        });
    }
}
