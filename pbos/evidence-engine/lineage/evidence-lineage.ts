/*
===============================================================================

PBOS Evidence Lineage

Authority

PBOS-CIP-003A-010

===============================================================================
*/

export interface EvidenceLineageRecord {

    readonly id: string;

    readonly evidenceId: string;

    readonly parentId?: string;

    readonly operation: string;

    readonly createdAt: Date;

}


export class EvidenceLineage {


    create(

        evidenceId: string,

        operation: string,

        parentId?: string

    ): EvidenceLineageRecord {


        return {

            id:
                crypto.randomUUID(),

            evidenceId,

            parentId,

            operation,

            createdAt:
                new Date()

        };

    }


}
