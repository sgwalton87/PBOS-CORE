export type BootStep =
    | "SYSTEM_IDENTITY" | "KERNEL" | "AUTHORITY_MODEL"
    | "MISSION_CONTEXT" | "DOMAIN_EXTENSIONS" | "RUNTIME_SERVICES";

const ORDER: readonly BootStep[] = [
    "SYSTEM_IDENTITY", "KERNEL", "AUTHORITY_MODEL",
    "MISSION_CONTEXT", "DOMAIN_EXTENSIONS", "RUNTIME_SERVICES"
];

export class BootSequence {
    private readonly completed: BootStep[] = [];

    complete(step: BootStep): void {
        const expected = ORDER[this.completed.length];
        if (step !== expected) throw new Error(`Invalid boot step: expected ${expected}, received ${step}`);
        this.completed.push(step);
    }

    steps(): readonly BootStep[] { return [...this.completed]; }
    completeSuccessfully(): boolean { return this.completed.length === ORDER.length; }
}
