/*
===============================================================================

PBOS Capability Contract

Authority

PBOS-CIP-005A-002

Classification

Constitutional Contract

===============================================================================
*/


export type CapabilityStatus =

    | "IDENTIFIED"

    | "VALIDATED"

    | "OPERATIONAL"

    | "RETIRED";



export interface Capability {


    readonly id: string;


    readonly name: string;


    readonly description: string;


    readonly status: CapabilityStatus;


    readonly sourceKnowledgeIds: readonly string[];


    readonly ownerRoleIds: readonly string[];


    readonly confidence: number;


    readonly metadata: Record<string, unknown>;


}
