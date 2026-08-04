export interface ReasoningResult {
    readonly requestId: string;
    readonly observations: readonly string[];
    readonly conclusions: readonly string[];
    readonly confidence: number;
    readonly explanation: readonly string[];
    readonly provenance: readonly string[];
    readonly generatedAt: Date;
}
