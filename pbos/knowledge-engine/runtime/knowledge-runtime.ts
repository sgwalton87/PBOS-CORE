/*
===============================================================================

PBOS Knowledge Runtime

Authority

PBOS-CIP-004A-012

===============================================================================
*/

import {

    EvidenceArtifact

}

from "../../compiler-artifacts";


import {

    EntityExtractor

}

from "../extraction/entity-extractor";


import {

    RelationshipExtractor

}

from "../extraction/relationship-extractor";


import {

    GraphBuilder

}

from "../graph/graph-builder";


import {

    KnowledgeGraph

}

from "../graph/knowledge-graph";



export class KnowledgeRuntime {


    private readonly entityExtractor =
        new EntityExtractor();


    private readonly relationshipExtractor =
        new RelationshipExtractor();


    private readonly graphBuilder =
        new GraphBuilder();



    compile(

        evidence: EvidenceArtifact

    ): KnowledgeGraph {


        const entities =

            this.entityExtractor.extract(

                evidence

            );


        const relationships =

            this.relationshipExtractor.extract(

                evidence,

                entities

            );


        return this.graphBuilder.build(

            entities,

            relationships

        );

    }


}
