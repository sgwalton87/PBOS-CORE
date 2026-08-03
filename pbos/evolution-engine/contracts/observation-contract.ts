/*
===============================================================================

PBOS Observation Contract

Authority

PBOS-CIP-008A-003

Classification

Evolution Runtime Contract

===============================================================================
*/


export type ObservationType =

    | "PERFORMANCE"

    | "BEHAVIOR"

    | "OUTCOME"

    | "RESOURCE"

    | "SYSTEM";



export interface ObservationContract {


    readonly id: string;


    readonly executionId: string;


    readonly type: ObservationType;


    readonly metric: string;


    readonly value: unknown;


    readonly observedAt: Date;


    readonly metadata: Record<string, unknown>;


}
