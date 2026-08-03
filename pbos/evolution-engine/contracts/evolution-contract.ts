/*
===============================================================================

PBOS Evolution Contract

Authority

PBOS-CIP-008A-001

Classification

Evolution Runtime Contract

===============================================================================
*/


export type EvolutionStatus =

    | "IDENTIFIED"

    | "EVALUATING"

    | "PROPOSED"

    | "APPROVED"

    | "IMPLEMENTED"

    | "REJECTED";



export interface EvolutionContract {


    readonly id: string;


    readonly sourceExecutionId: string;


    readonly status: EvolutionStatus;


    readonly observations: readonly string[];


    readonly recommendations: readonly string[];


    readonly createdAt: Date;


    readonly metadata: Record<string, unknown>;


}
