/*
===============================================================================

PBOS Operating System Lineage

Authority

PBOS-CIP-006A-011

Classification

Operating System Provenance

===============================================================================
*/


export interface OSLineageRecord {


    readonly id: string;


    readonly operatingSystemId: string;


    readonly sourceOrganizationId: string;


    readonly sourceArtifactIds: readonly string[];


    readonly operation: string;


    readonly createdAt: Date;


}



export class OSLineage {



    create(

        operatingSystemId: string,

        sourceOrganizationId: string,

        sourceArtifactIds: readonly string[],

        operation: string

    ): OSLineageRecord {


        return {


            id:

                crypto.randomUUID(),


            operatingSystemId,


            sourceOrganizationId,


            sourceArtifactIds,


            operation,


            createdAt:

                new Date()


        };


    }


}
