/*
===============================================================================

PBOS Execution Contract

Authority

PBOS-CIP-007A-001

Classification

Constitutional Runtime Contract

===============================================================================
*/


export type ExecutionStatus =

    | "INITIALIZED"

    | "RUNNING"

    | "PAUSED"

    | "COMPLETED"

    | "FAILED";



export interface ExecutionContract {


    readonly id: string;


    readonly name: string;


    readonly status: ExecutionStatus;


    readonly sourceOperatingSystemId: string;


    readonly missionIds: readonly string[];


    readonly actorIds: readonly string[];


    readonly workflowIds: readonly string[];


    readonly createdAt: Date;


    readonly metadata: Record<string, unknown>;


}
