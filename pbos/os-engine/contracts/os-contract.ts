/*
===============================================================================

PBOS Operating System Contract

Authority

PBOS-CIP-006A-001

Classification

Constitutional Contract

===============================================================================
*/


export type OperatingSystemStatus =

    | "DESIGNED"

    | "COMPILED"

    | "VALIDATED"

    | "ACTIVE"

    | "ARCHIVED";



export interface OperatingSystemContract {


    readonly id: string;


    readonly name: string;


    readonly status: OperatingSystemStatus;


    readonly sourceOrganizationId: string;


    readonly missionIds: readonly string[];


    readonly roleIds: readonly string[];


    readonly workflowIds: readonly string[];


    readonly confidence: number;


    readonly createdAt: Date;


    readonly metadata: Record<string, unknown>;


}
