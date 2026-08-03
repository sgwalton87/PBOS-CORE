/*
===============================================================================

PBOS Knowledge Relationship Contract

Authority

PBOS-CIP-004A-003

===============================================================================
*/

export type RelationshipType =

    | "OWNS"

    | "SUPPORTS"

    | "PROVIDES"

    | "DEPENDS_ON"

    | "COLLABORATES_WITH"

    | "RELATED_TO";


export interface KnowledgeRelationship {


    readonly id: string;


    readonly type: RelationshipType;


    readonly sourceEntityId: string;


    readonly targetEntityId: string;


    readonly confidence: number;


    readonly sourceEvidenceIds: readonly string[];


    readonly metadata: Record<string, unknown>;

}
