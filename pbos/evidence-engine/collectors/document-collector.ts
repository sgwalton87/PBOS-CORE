/*
===============================================================================

PBOS Document Evidence Collector

Authority

PBOS-CIP-003A-005

===============================================================================
*/

import {
    EvidenceRecord
}
from "../contracts/evidence-record";

import {
    EvidenceSource
}
from "../contracts/evidence-source";


export class DocumentCollector {


    collect(

        source: EvidenceSource,

        content: unknown

    ): EvidenceRecord {

        return {

            id:
                crypto.randomUUID(),

            type:
                "DOCUMENT",

            status:
                "COLLECTED",

            source,

            payload:
                content,

            collectedAt:
                new Date(),

            confidence:
                0,

            metadata: {}

        };

    }


}
