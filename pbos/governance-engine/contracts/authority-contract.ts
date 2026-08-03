/*
===============================================================================

PBOS Authority Contract

Authority

PBOS-CIP-009A-001

Classification

Governance Runtime Contract

===============================================================================
*/


export type AuthorityLevel =

    | "SYSTEM"

    | "ORGANIZATION"

    | "ROLE"

    | "USER";



export interface AuthorityContract {


    readonly id: string;


    readonly name: string;


    readonly level: AuthorityLevel;


    readonly permissions: readonly string[];


    readonly active: boolean;


    readonly createdAt: Date;


    readonly metadata: Record<string, unknown>;


}
