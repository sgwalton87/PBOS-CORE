/*
===============================================================================

PBOS Knowledge Lineage

Authority

PBOS-CIP-004A-011

===============================================================================
*/

export interface KnowledgeLineageRecord {


    readonly id: string;


    readonly knowledgeId: string;


    readonly sourceEvidenceIds: readonly string[];


    readonly operation: string;


    readonly createdAt: Date;


}



export class KnowledgeLineage {


    create(

        knowledgeId: string,

        sourceEvidenceIds: readonly string[],

        operation: string

    ): KnowledgeLineageRecord {


        return {


            id:

                crypto.randomUUID(),


            knowledgeId,


            sourceEvidenceIds,


            operation,


            createdAt:

                new Date()

        };

    }


}
