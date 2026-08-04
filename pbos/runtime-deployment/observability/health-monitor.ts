import { randomUUID } from "crypto";
import { RuntimeInstance } from "../contracts/runtime-instance";
import { RuntimeEvent } from "./runtime-event";

export interface RuntimeHealth {
    readonly healthy: boolean;
    readonly status: RuntimeInstance["lifecycleState"];
    readonly checkedAt: Date;
    readonly reasons: readonly string[];
}

export class HealthMonitor {
    private readonly events: RuntimeEvent[] = [];

    check(instance: RuntimeInstance): RuntimeHealth {
        const healthy = instance.lifecycleState === "ACTIVE" && instance.kernelState.lifecycleState === "ACTIVE";
        const health = {
            healthy,
            status: instance.lifecycleState,
            checkedAt: new Date(),
            reasons: healthy ? [] : ["Runtime instance or kernel is not active."]
        };
        this.record(instance.instanceId, "HEALTH", "runtime.health.checked", { healthy });
        return health;
    }

    record(instanceId: string, type: RuntimeEvent["type"], name: string, details: Readonly<Record<string, unknown>>): RuntimeEvent {
        const event = { eventId: randomUUID(), instanceId, type, name, occurredAt: new Date(), details };
        this.events.push(event);
        return event;
    }

    history(instanceId: string): readonly RuntimeEvent[] { return this.events.filter(event => event.instanceId === instanceId); }
}
