/*
===============================================================================

PBOS Knowledge Report

Authority

PBOS-CIP-004A-013

===============================================================================
*/

import {

    KnowledgeGraph

}

from "../graph/knowledge-graph";


export interface KnowledgeReport {


    readonly id: string;


    readonly generatedAt: Date;


    readonly entityCount: number;


    readonly relationshipCount: number;


    readonly confidence: number;


    readonly graphId: string;


}



export function createKnowledgeReport(

    graph: KnowledgeGraph

): KnowledgeReport {


    return {


        id:

            crypto.randomUUID(),


        generatedAt:

            new Date(),


        entityCount:

            graph.entities.length,


        relationshipCount:

            graph.relationships.length,


        confidence:

            graph.confidence,


        graphId:

            graph.id

    };

}
