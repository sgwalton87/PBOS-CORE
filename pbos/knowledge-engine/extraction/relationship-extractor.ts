/*
===============================================================================

PBOS Relationship Extractor

Authority

PBOS-CIP-004A-006

===============================================================================
*/

import {

    KnowledgeRelationship

}

from "../contracts/relationship";


import {

    KnowledgeEntity

}

from "../contracts/entity";


import {

    EvidenceArtifact

}

from "../../compiler-artifacts";


export class RelationshipExtractor {


    extract(

        evidence: EvidenceArtifact,

        entities: readonly KnowledgeEntity[]

    ): KnowledgeRelationship[] {


        if (entities.length < 2) {

            return [];

        }


        return [

            {

                id:

                    crypto.randomUUID(),


                type:

                    "RELATED_TO",


                sourceEntityId:

                    entities[0].id,


                targetEntityId:

                    entities[1].id,


                confidence:

                    evidence.confidence,


                sourceEvidenceIds:

                    [

                        evidence.id

                    ],


                metadata:

                    {

                        extractedBy:

                            "RelationshipExtractor"

                    }

            }

        ];

    }


}
