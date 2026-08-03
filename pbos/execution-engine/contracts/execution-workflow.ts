/*
===============================================================================

PBOS Execution Workflow Contract

Authority

PBOS-CIP-007A-004

Classification

Execution Runtime Contract

===============================================================================
*/


export type ExecutionWorkflowStatus =

    | "REGISTERED"

    | "READY"

    | "RUNNING"

    | "COMPLETED"

    | "FAILED";



export interface ExecutionWorkflow {


    readonly id: string;


    readonly name: string;


    readonly sourceWorkflowId: string;


    readonly steps: readonly string[];


    readonly assignedActorIds: readonly string[];


    readonly status: ExecutionWorkflowStatus;


    readonly metadata: Record<string, unknown>;


}
