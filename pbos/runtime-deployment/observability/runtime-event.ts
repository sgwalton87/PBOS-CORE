export type RuntimeEventType = "LIFECYCLE" | "AUDIT" | "HEALTH" | "RECOVERY";

export interface RuntimeEvent {
    readonly eventId: string;
    readonly instanceId: string;
    readonly type: RuntimeEventType;
    readonly name: string;
    readonly occurredAt: Date;
    readonly details: Readonly<Record<string, unknown>>;
}
