/*
===============================================================================

PBOS Workflow Contract

Authority

PBOS-CIP-005A-004

Classification

Constitutional Contract

===============================================================================
*/


export type WorkflowStatus =

    | "DEFINED"

    | "VALIDATED"

    | "ACTIVE"

    | "RETIRED";



export interface Workflow {


    readonly id: string;


    readonly name: string;


    readonly description: string;


    readonly steps: readonly string[];


    readonly responsibleRoleIds: readonly string[];


    readonly status: WorkflowStatus;


    readonly metadata: Record<string, unknown>;


}
