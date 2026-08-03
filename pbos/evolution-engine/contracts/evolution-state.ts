/*
===============================================================================

PBOS Evolution State Contract

Authority

PBOS-CIP-008A-004

Classification

Evolution Runtime State

===============================================================================
*/


export type EvolutionStateStatus =

    | "OBSERVING"

    | "EVALUATING"

    | "PROPOSING"

    | "APPLYING"

    | "COMPLETE";



export interface EvolutionState {


    readonly id: string;


    readonly evolutionId: string;


    readonly status: EvolutionStateStatus;


    readonly observationCount: number;


    readonly feedbackCount: number;


    readonly updatedAt: Date;


    readonly metadata: Record<string, unknown>;


}
