export interface ImprovementOpportunity {
    readonly opportunityId: string;
    readonly systemId: string;
    readonly observationIds: readonly string[];
    readonly category: "INEFFICIENCY" | "FAILURE" | "OPTIMIZATION";
    readonly description: string;
    readonly severity: "LOW" | "MEDIUM" | "HIGH";
    readonly confidence: number;
    readonly detectedAt: Date;
}
