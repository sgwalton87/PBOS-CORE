/*
===============================================================================

PBOS Evidence Collector

Authority

PBOS-DI-004

===============================================================================

Purpose

Collect organizational evidence from constitutional evidence sources.

The collector SHALL preserve provenance and SHALL NOT modify source evidence.

===============================================================================
*/

import { EvidenceSource } from "./evidence-source";

export class EvidenceCollector {

    async collect(

        sources: readonly EvidenceSource[]

    ): Promise<void> {

        console.log(

            `Collecting evidence from ${sources.length} source(s)...`

        );

    }

}
