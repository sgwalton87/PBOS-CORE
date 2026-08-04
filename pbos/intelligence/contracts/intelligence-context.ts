export interface IntelligenceSource {
    readonly sourceId: string;
    readonly sourceType: "EVIDENCE" | "KNOWLEDGE" | "RUNTIME" | "FEEDBACK";
    readonly approved: boolean;
    readonly content: unknown;
    readonly provenance: readonly string[];
}

export interface IntelligenceContext {
    readonly contextId: string;
    readonly instanceId: string;
    readonly systemId: string;
    readonly actorId: string;
    readonly sources: readonly IntelligenceSource[];
    readonly provenance: readonly string[];
    readonly createdAt: Date;
}
