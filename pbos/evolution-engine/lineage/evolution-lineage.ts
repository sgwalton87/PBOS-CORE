/*
===============================================================================

PBOS Evolution Lineage

Authority

PBOS-CIP-008A-011

Classification

Evolution Provenance

===============================================================================
*/


export interface EvolutionLineageRecord {


    readonly id: string;


    readonly evolutionId: string;


    readonly sourceExecutionId: string;


    readonly event: string;


    readonly createdAt: Date;


}



export class EvolutionLineage {



    record(

        evolutionId: string,

        executionId: string,

        event: string

    ): EvolutionLineageRecord {



        return {


            id:

                crypto.randomUUID(),


            evolutionId,


            sourceExecutionId:

                executionId,


            event,


            createdAt:

                new Date()


        };


    }


}
