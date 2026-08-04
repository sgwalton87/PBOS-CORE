export type IntelligenceResponseStatus = "PROPOSED" | "REQUIRES_HUMAN_APPROVAL" | "DENIED";

export interface IntelligenceResponse<T = unknown> {
    readonly responseId: string;
    readonly requestId: string;
    readonly output: T;
    readonly confidence: number;
    readonly explanation: readonly string[];
    readonly provenance: readonly string[];
    readonly status: IntelligenceResponseStatus;
    readonly generatedAt: Date;
}
