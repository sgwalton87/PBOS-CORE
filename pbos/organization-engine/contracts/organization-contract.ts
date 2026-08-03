/*
===============================================================================

PBOS Organization Contract

Authority

PBOS-CIP-005A-001

Classification

Constitutional Contract

===============================================================================
*/


export type OrganizationStatus =

    | "DISCOVERED"

    | "MODELED"

    | "VALIDATED"

    | "ACTIVE"

    | "ARCHIVED";


export interface OrganizationContract {


    readonly id: string;


    readonly name: string;


    readonly status: OrganizationStatus;


    readonly sourceKnowledgeIds: readonly string[];


    readonly capabilityIds: readonly string[];


    readonly roleIds: readonly string[];


    readonly workflowIds: readonly string[];


    readonly confidence: number;


    readonly createdAt: Date;


    readonly metadata: Record<string, unknown>;


}
