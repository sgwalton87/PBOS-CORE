/*
===============================================================================

PBOS Execution Lineage

Authority

PBOS-CIP-007A-012

Classification

Runtime Provenance

===============================================================================
*/


export interface ExecutionLineageRecord {


    readonly id: string;


    readonly executionId: string;


    readonly sourceOperatingSystemId: string;


    readonly event: string;


    readonly createdAt: Date;


}



export class ExecutionLineage {



    record(

        executionId: string,

        operatingSystemId: string,

        event: string

    ): ExecutionLineageRecord {



        return {


            id:

                crypto.randomUUID(),


            executionId,


            sourceOperatingSystemId:

                operatingSystemId,


            event,


            createdAt:

                new Date()


        };


    }


}
