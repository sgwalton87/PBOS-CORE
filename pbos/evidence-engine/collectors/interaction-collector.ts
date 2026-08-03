/*
===============================================================================

PBOS Interaction Evidence Collector

Authority

PBOS-CIP-003A-006

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


export class InteractionCollector {


    collect(

        source: EvidenceSource,

        interaction: unknown

    ): EvidenceRecord {

        return {

            id:
                crypto.randomUUID(),

            type:
                "INTERACTION",

            status:
                "COLLECTED",

            source,

            payload:
                interaction,

            collectedAt:
                new Date(),

            confidence:
                0,

            metadata: {}

        };

    }


}
