/*
===============================================================================

PBOS Organization Lineage

Authority

PBOS-CIP-005A-011

Classification

Organizational Provenance

===============================================================================
*/


export interface OrganizationLineageRecord {


    readonly id: string;


    readonly organizationId: string;


    readonly sourceKnowledgeIds: readonly string[];


    readonly operation: string;


    readonly createdAt: Date;


}



export class OrganizationLineage {


    create(

        organizationId: string,

        sourceKnowledgeIds: readonly string[],

        operation: string

    ): OrganizationLineageRecord {


        return {


            id:

                crypto.randomUUID(),


            organizationId,


            sourceKnowledgeIds,


            operation,


            createdAt:

                new Date()


        };

    }


}
