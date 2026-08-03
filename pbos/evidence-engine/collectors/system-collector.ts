/*
===============================================================================

PBOS System Evidence Collector

Authority

PBOS-CIP-003A-007

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


export class SystemCollector {


    collect(

        source: EvidenceSource,

        systemData: unknown

    ): EvidenceRecord {

        return {

            id:
                crypto.randomUUID(),

            type:
                "SYSTEM",

            status:
                "COLLECTED",

            source,

            payload:
                systemData,

            collectedAt:
                new Date(),

            confidence:
                0,

            metadata: {}

        };

    }


}
