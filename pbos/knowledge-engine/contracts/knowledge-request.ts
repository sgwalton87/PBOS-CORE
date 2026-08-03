/*
===============================================================================

PBOS Knowledge Request Contract

Authority

PBOS-CIP-004A-004

===============================================================================
*/

export interface KnowledgeRequest {


    readonly id: string;


    readonly requestedBy: string;


    readonly purpose: string;


    readonly evidenceIds: readonly string[];


    readonly requestedKnowledge:

        readonly (

            | "ENTITIES"

            | "RELATIONSHIPS"

            | "GRAPH"

            | "UNDERSTANDING"

        )[];


    readonly createdAt: Date;


}
