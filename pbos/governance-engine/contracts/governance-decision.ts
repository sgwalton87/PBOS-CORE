/*
===============================================================================

PBOS Governance Decision Contract

Authority

PBOS-CIP-009A-004

Classification

Governance Runtime Contract

===============================================================================
*/


export type GovernanceDecisionStatus =

    | "PENDING"

    | "AUTHORIZED"

    | "DENIED"

    | "REVIEW";



export interface GovernanceDecision {


    readonly id: string;


    readonly changeId: string;


    readonly authorityId: string;


    readonly policyIds: readonly string[];


    readonly status: GovernanceDecisionStatus;


    readonly explanation: string;


    readonly createdAt: Date;


    readonly metadata: Record<string, unknown>;


}
