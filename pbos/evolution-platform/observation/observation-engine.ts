import { randomUUID } from "crypto";
import { SystemObservation } from "./system-observation";

export class EvolutionObservationEngine {
    private readonly observations: SystemObservation[] = [];
    observe(input: Omit<SystemObservation, "observationId" | "observedAt">): SystemObservation {
        if (!Number.isFinite(input.value)) throw new Error("Evolution observation value must be finite.");
        const observation = { ...input, observationId: randomUUID(), observedAt: new Date() };
        this.observations.push(observation);
        return observation;
    }
    forSystem(systemId: string): readonly SystemObservation[] {
        return this.observations.filter(observation => observation.systemId === systemId);
    }
}
