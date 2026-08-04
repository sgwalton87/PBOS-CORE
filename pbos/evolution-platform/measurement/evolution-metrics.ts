export interface EvolutionMetrics {
    readonly changeId: string;
    readonly baseline: number;
    readonly current: number;
    readonly impact: number;
    readonly effectiveness: number;
    readonly regression: boolean;
    readonly measuredAt: Date;
}

export class EvolutionMetricsEngine {
    measure(changeId: string, baseline: number, current: number, expectedImprovement: number): EvolutionMetrics {
        if (![baseline, current, expectedImprovement].every(Number.isFinite)) throw new Error("Evolution metrics must be finite.");
        const impact = current - baseline;
        return {
            changeId, baseline, current, impact,
            effectiveness: expectedImprovement === 0 ? (impact >= 0 ? 1 : 0) : impact / expectedImprovement,
            regression: impact < 0, measuredAt: new Date()
        };
    }
}
