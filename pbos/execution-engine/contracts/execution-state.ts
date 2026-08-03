/*
===============================================================================

PBOS Execution State Contract

Authority

PBOS-CIP-007A-002

Classification

Runtime State Contract

===============================================================================
*/


export type ExecutionStateStatus =

    | "CREATED"

    | "READY"

    | "ACTIVE"

    | "BLOCKED"

    | "COMPLETED"

    | "FAILED";



export interface ExecutionState {


    readonly id: string;


    readonly executionId: string;


    readonly status: ExecutionStateStatus;


    readonly activeMissionIds: readonly string[];


    readonly activeWorkflowIds: readonly string[];


    readonly activeActorIds: readonly string[];


    readonly updatedAt: Date;


    readonly metadata: Record<string, unknown>;


}
