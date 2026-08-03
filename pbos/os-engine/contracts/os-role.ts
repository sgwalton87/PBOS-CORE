/*
===============================================================================

PBOS Operating System Role Contract

Authority

PBOS-CIP-006A-003

Classification

Operating System Contract

===============================================================================
*/


export type OperatingRoleStatus =

    | "DEFINED"

    | "ASSIGNED"

    | "ACTIVE"

    | "RETIRED";



export interface OperatingRole {


    readonly id: string;


    readonly name: string;


    readonly purpose: string;


    readonly responsibilities: readonly string[];


    readonly capabilityIds: readonly string[];


    readonly status: OperatingRoleStatus;


    readonly metadata: Record<string, unknown>;


}
