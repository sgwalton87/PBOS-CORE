/*
===============================================================================

PBOS Governance Policy Contract

Authority

PBOS-CIP-009A-003

Classification

Governance Runtime Contract

===============================================================================
*/


export type PolicyScope =

    | "SYSTEM"

    | "EXECUTION"

    | "EVOLUTION"

    | "CHANGE";



export interface PolicyContract {


    readonly id: string;


    readonly name: string;


    readonly scope: PolicyScope;


    readonly rules: readonly string[];


    readonly active: boolean;


    readonly createdAt: Date;


    readonly metadata: Record<string, unknown>;


}
