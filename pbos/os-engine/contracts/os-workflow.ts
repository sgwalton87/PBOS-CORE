/*
===============================================================================

PBOS Operating System Workflow Contract

Authority

PBOS-CIP-006A-004

Classification

Operating System Contract

===============================================================================
*/


export type OperatingWorkflowStatus =

    | "DESIGNED"

    | "VALIDATED"

    | "ACTIVE"

    | "RETIRED";



export interface OperatingWorkflow {


    readonly id: string;


    readonly name: string;


    readonly description: string;


    readonly steps: readonly string[];


    readonly responsibleRoleIds: readonly string[];


    readonly status: OperatingWorkflowStatus;


    readonly metadata: Record<string, unknown>;


}
