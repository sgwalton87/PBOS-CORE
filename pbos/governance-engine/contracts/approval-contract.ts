/*
===============================================================================

PBOS Approval Contract

Authority

PBOS-CIP-009A-002

Classification

Governance Runtime Contract

===============================================================================
*/


export type ApprovalStatus =

    | "PENDING"

    | "APPROVED"

    | "REJECTED"

    | "ESCALATED";



export interface ApprovalContract {


    readonly id: string;


    readonly changeId: string;


    readonly authorityId: string;


    readonly status: ApprovalStatus;


    readonly rationale: string;


    readonly createdAt: Date;


    readonly metadata: Record<string, unknown>;


}
