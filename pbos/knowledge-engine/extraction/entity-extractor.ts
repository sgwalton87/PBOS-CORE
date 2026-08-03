/*
===============================================================================

PBOS Entity Extractor

Authority

PBOS-CIP-004A-005

===============================================================================
*/

import {

    KnowledgeEntity

}

from "../contracts/entity";


import {

    EvidenceArtifact

}

from "../../compiler-artifacts";


export class EntityExtractor {


    extract(

        evidence: EvidenceArtifact

    ): KnowledgeEntity[] {


        return [

            {

                id:

                    crypto.randomUUID(),


                type:

                    "UNKNOWN",


                name:

                    "Extracted Entity",


                confidence:

                    evidence.confidence,


                sourceEvidenceIds:

                    [

                        evidence.id

                    ],


                metadata:

                    {

                        extractedBy:

                            "EntityExtractor"

                    }

            }

        ];

    }


}
