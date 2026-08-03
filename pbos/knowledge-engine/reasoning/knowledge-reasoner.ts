/*
===============================================================================

PBOS Knowledge Reasoner

Authority

PBOS-CIP-004A-010

===============================================================================
*/

import {

    KnowledgeGraph

}

from "../graph/knowledge-graph";


export interface ReasoningResult {


    readonly summary: string;


    readonly confidence: number;


    readonly graphId: string;


}



export class KnowledgeReasoner {


    reason(

        graph: KnowledgeGraph

    ): ReasoningResult {


        return {


            summary:

                `Knowledge graph contains ${graph.entities.length} entities and ${graph.relationships.length} relationships.`,


            confidence:

                graph.confidence,


            graphId:

                graph.id

        };

    }


}
