export type KernelWorkflowState =
    | "CREATED"
    | "READY"
    | "ACTIVE"
    | "SUSPENDED"
    | "COMPLETED"
    | "FAILED";

export interface KernelWorkflow {
    readonly workflowId: string;
    readonly systemId: string;
    readonly missionId?: string;
    readonly steps: readonly string[];
    readonly actorIds: readonly string[];
    readonly state: KernelWorkflowState;
    readonly updatedAt: Date;
}
