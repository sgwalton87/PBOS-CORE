/*
===============================================================================

PBOS Ontology Mapper

Authority

PBOS-CIP-004A-009

===============================================================================
*/

import {

    KnowledgeEntity

}

from "../contracts/entity";


export interface OntologyMapping {


    readonly entityId: string;


    readonly ontologyType: string;


    readonly mappedAt: Date;


}



export class OntologyMapper {


    map(

        entity: KnowledgeEntity

    ): OntologyMapping {


        return {


            entityId:

                entity.id,


            ontologyType:

                entity.type,


            mappedAt:

                new Date()

        };

    }


}
