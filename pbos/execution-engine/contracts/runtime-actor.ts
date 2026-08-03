/*
===============================================================================

PBOS Runtime Actor Contract

Authority

PBOS-CIP-007A-003

Classification

Execution Runtime Contract

===============================================================================
*/


export type RuntimeActorStatus =

    | "DEFINED"

    | "AVAILABLE"

    | "EXECUTING"

    | "PAUSED"

    | "OFFLINE";



export interface RuntimeActor {


    readonly id: string;


    readonly name: string;


    readonly roleId: string;


    readonly capabilityIds: readonly string[];


    readonly status: RuntimeActorStatus;


    readonly metadata: Record<string, unknown>;


}
