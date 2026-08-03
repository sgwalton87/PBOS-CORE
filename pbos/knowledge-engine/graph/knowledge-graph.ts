/*
===============================================================================

PBOS Knowledge Graph Contract

Authority

PBOS-CIP-004A-007

===============================================================================
*/

import {

    KnowledgeEntity

}

from "../contracts/entity";


import {

    KnowledgeRelationship

}

from "../contracts/relationship";


export interface KnowledgeGraph {


    readonly id: string;


    readonly entities: readonly KnowledgeEntity[];


    readonly relationships: readonly KnowledgeRelationship[];


    readonly createdAt: Date;


    readonly confidence: number;


}
