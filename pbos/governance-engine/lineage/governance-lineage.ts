/*
===============================================================================

PBOS Governance Lineage

Authority

PBOS-CIP-009A-011

Classification

Governance Provenance

===============================================================================
*/


export interface GovernanceLineageRecord {


    readonly id: string;


    readonly decisionId: string;


    readonly authorityId: string;


    readonly event: string;


    readonly createdAt: Date;


}



export class GovernanceLineage {



    record(

        decisionId: string,

        authorityId: string,

        event: string

    ): GovernanceLineageRecord {



        return {


            id:

                crypto.randomUUID(),


            decisionId,


            authorityId,


            event,


            createdAt:

                new Date()


        };


    }


}
