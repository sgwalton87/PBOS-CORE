import { IntelligenceFeedbackEvent } from "./feedback-event";

export interface FeedbackSignal {
    readonly requestId: string;
    readonly eventCount: number;
    readonly acceptanceRate: number;
    readonly averageEffectiveness?: number;
    readonly provenance: readonly string[];
}

export class FeedbackProcessor {
    private readonly events: IntelligenceFeedbackEvent[] = [];

    capture(event: IntelligenceFeedbackEvent): void {
        if (this.events.some(candidate => candidate.eventId === event.eventId)) throw new Error(`Feedback event already captured: ${event.eventId}`);
        this.events.push(event);
    }

    signal(requestId: string): FeedbackSignal {
        const events = this.events.filter(event => event.requestId === requestId);
        const scored = events.filter(event => event.effectiveness !== undefined);
        return {
            requestId,
            eventCount: events.length,
            acceptanceRate: events.length === 0 ? 0 : events.filter(event => event.outcome === "ACCEPTED").length / events.length,
            averageEffectiveness: scored.length === 0 ? undefined : scored.reduce((sum, event) => sum + (event.effectiveness ?? 0), 0) / scored.length,
            provenance: [...new Set(events.flatMap(event => event.provenance))]
        };
    }
}
