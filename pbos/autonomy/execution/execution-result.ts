export interface ActionExecutionResult {
    readonly actionId: string;
    readonly success: boolean;
    readonly output: unknown;
    readonly executedAt: Date;
}

export interface AutonomousExecutionResult {
    readonly executionId: string;
    readonly planId: string;
    readonly success: boolean;
    readonly actions: readonly ActionExecutionResult[];
    readonly lineage: readonly string[];
    readonly errors: readonly string[];
    readonly completedAt: Date;
}
