import { RuntimeInstance } from "../contracts/runtime-instance";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import { HealthMonitor } from "../observability/health-monitor";

export interface RecoveryResult {
    readonly recovered: boolean;
    readonly instance: RuntimeInstance;
    readonly attemptedAt: Date;
}

export class RecoveryManager {
    constructor(private readonly health: HealthMonitor) {}

    async recover(instance: RuntimeInstance, restore: () => Promise<boolean>): Promise<RecoveryResult> {
        if (instance.lifecycleState !== "FAILED") throw new Error("Only failed runtime instances may recover.");
        const lifecycle = new RuntimeLifecycle("FAILED");
        lifecycle.transition("RECOVERING");
        const restored = await restore();
        lifecycle.transition(restored ? "ACTIVE" : "FAILED");
        const recovered = { ...instance, lifecycleState: lifecycle.current(), updatedAt: new Date() };
        this.health.record(instance.instanceId, "RECOVERY", restored ? "runtime.recovered" : "runtime.recovery.failed", {
            previousState: instance.lifecycleState
        });
        return { recovered: restored, instance: recovered, attemptedAt: new Date() };
    }
}
