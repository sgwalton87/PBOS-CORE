export type RuntimeLifecycleState =
    | "CREATED" | "INITIALIZED" | "ACTIVE" | "SUSPENDED"
    | "RECOVERING" | "SHUTDOWN" | "FAILED";

const TRANSITIONS: Readonly<Record<RuntimeLifecycleState, readonly RuntimeLifecycleState[]>> = {
    CREATED: ["INITIALIZED", "FAILED"],
    INITIALIZED: ["ACTIVE", "FAILED", "SHUTDOWN"],
    ACTIVE: ["SUSPENDED", "FAILED", "SHUTDOWN"],
    SUSPENDED: ["ACTIVE", "FAILED", "SHUTDOWN"],
    RECOVERING: ["ACTIVE", "FAILED", "SHUTDOWN"],
    SHUTDOWN: [],
    FAILED: ["RECOVERING", "SHUTDOWN"]
};

export class RuntimeLifecycle {
    constructor(private state: RuntimeLifecycleState = "CREATED") {}

    current(): RuntimeLifecycleState { return this.state; }

    transition(next: RuntimeLifecycleState): RuntimeLifecycleState {
        if (!TRANSITIONS[this.state].includes(next)) {
            throw new Error(`Invalid runtime transition: ${this.state} -> ${next}`);
        }
        this.state = next;
        return this.state;
    }
}
