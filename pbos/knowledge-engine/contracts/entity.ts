/*
===============================================================================

PBOS Knowledge Entity Contract

Authority

PBOS-CIP-004A-002

===============================================================================
*/

export type EntityType =

    | "ORGANIZATION"

    | "PERSON"

    | "PROGRAM"

    | "RESOURCE"

    | "CONCEPT"

    | "LOCATION"

    | "UNKNOWN";


export interface KnowledgeEntity {


    readonly id: string;


    readonly type: EntityType;


    readonly name: string;


    readonly description?: string;


    readonly confidence: number;


    readonly sourceEvidenceIds: readonly string[];


    readonly metadata: Record<string, unknown>;

}
