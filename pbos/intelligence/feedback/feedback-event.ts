export type IntelligenceFeedbackOutcome = "ACCEPTED" | "REJECTED" | "MODIFIED" | "NO_ACTION";

export interface IntelligenceFeedbackEvent {
    readonly eventId: string;
    readonly requestId: string;
    readonly responseId: string;
    readonly actorId: string;
    readonly outcome: IntelligenceFeedbackOutcome;
    readonly effectiveness?: number;
    readonly explanation?: string;
    readonly provenance: readonly string[];
    readonly occurredAt: Date;
}
