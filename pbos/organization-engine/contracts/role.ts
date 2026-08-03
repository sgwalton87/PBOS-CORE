/*
===============================================================================

PBOS Role Contract

Authority

PBOS-CIP-005A-003

Classification

Constitutional Contract

===============================================================================
*/


export type RoleStatus =

    | "DEFINED"

    | "ASSIGNED"

    | "ACTIVE"

    | "ARCHIVED";



export interface OrganizationRole {


    readonly id: string;


    readonly title: string;


    readonly purpose: string;


    readonly responsibilities: readonly string[];


    readonly capabilityIds: readonly string[];


    readonly status: RoleStatus;


    readonly metadata: Record<string, unknown>;


}
