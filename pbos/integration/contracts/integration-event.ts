export type IntegrationEventType = "REGISTERED" | "CONNECTED" | "REQUESTED" | "RESPONDED" | "SUSPENDED" | "DISCONNECTED" | "FAILED";

export interface IntegrationEvent {
    readonly eventId: string;
    readonly connectorId: string;
    readonly type: IntegrationEventType;
    readonly correlationId?: string;
    readonly provenance: readonly string[];
    readonly details: Readonly<Record<string, unknown>>;
    readonly occurredAt: Date;
}
