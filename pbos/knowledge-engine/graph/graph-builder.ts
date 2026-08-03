/*
===============================================================================

PBOS Knowledge Graph Builder

Authority

PBOS-CIP-004A-008

===============================================================================
*/

import {

    KnowledgeGraph

}

from "./knowledge-graph";


import {

    KnowledgeEntity

}

from "../contracts/entity";


import {

    KnowledgeRelationship

}

from "../contracts/relationship";


export class GraphBuilder {


    build(

        entities: readonly KnowledgeEntity[],

        relationships: readonly KnowledgeRelationship[]

    ): KnowledgeGraph {


        const confidence =

            entities.length === 0

                ? 0

                : entities.reduce(

                    (sum, entity) =>

                        sum + entity.confidence,

                    0

                ) / entities.length;



        return {


            id:

                crypto.randomUUID(),


            entities,


            relationships,


            createdAt:

                new Date(),


            confidence

        };

    }


}
