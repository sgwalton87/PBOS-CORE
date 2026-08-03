/*
===============================================================================

PBOS Mission Contract

Authority

PBOS-CIP-006A-002

Classification

Operating System Contract

===============================================================================
*/


export type MissionStatus =

    | "DEFINED"

    | "ACTIVE"

    | "COMPLETED"

    | "ARCHIVED";



export interface Mission {


    readonly id: string;


    readonly name: string;


    readonly purpose: string;


    readonly objectives: readonly string[];


    readonly status: MissionStatus;


    readonly metadata: Record<string, unknown>;


}
