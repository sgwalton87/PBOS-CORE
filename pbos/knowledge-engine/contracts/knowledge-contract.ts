/*
===============================================================================

PBOS Knowledge Contract

Authority

PBOS-CIP-004A-001

Classification

Constitutional Contract

===============================================================================
*/

export type KnowledgeType =

    | "ENTITY"

    | "RELATIONSHIP"

    | "GRAPH"

    | "UNDERSTANDING";


export type KnowledgeStatus =

    | "EXTRACTED"

    | "MAPPED"

    | "VALIDATED"

    | "REJECTED";


export interface KnowledgeContract {


    readonly id: string;


    readonly knowledgeType: KnowledgeType;


    readonly status: KnowledgeStatus;


    readonly sourceEvidenceIds: readonly string[];


    readonly confidence: number;


    readonly createdAt: Date;


    readonly metadata: Record<string, unknown>;


}
