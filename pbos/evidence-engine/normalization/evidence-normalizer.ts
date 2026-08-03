/*
===============================================================================

PBOS Evidence Normalizer

Authority

PBOS-CIP-003A-008

===============================================================================
*/

import {
    EvidenceRecord
}
from "../contracts/evidence-record";


export class EvidenceNormalizer {


    normalize(

        evidence: EvidenceRecord

    ): EvidenceRecord {


        return {

            ...evidence,

            status:
                "NORMALIZED",

            normalizedAt:
                new Date(),

            metadata: {

                ...evidence.metadata,

                normalized: true

            }

        };

    }


}
