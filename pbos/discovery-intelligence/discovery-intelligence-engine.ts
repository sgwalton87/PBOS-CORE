/*
===============================================================================

PBOS Discovery Intelligence Engine

Authority

PBOS-DI-001

===============================================================================
*/

import { DiscoveryRuntime }
from "./runtime/discovery-runtime";

import { EvidenceCollector }
from "./evidence/evidence-collector";

import { EvidenceFusion }
from "./fusion/evidence-fusion";

import { ConfidenceEngine }
from "./confidence/confidence-engine";

export class DiscoveryIntelligenceEngine {

    private readonly runtime =
        new DiscoveryRuntime();

    private readonly collector =
        new EvidenceCollector();

    private readonly fusion =
        new EvidenceFusion();

    private readonly confidence =
        new ConfidenceEngine();

    async initialize(): Promise<void> {

        await this.runtime.initialize();

    }

    async execute(): Promise<void> {

        console.log(

            "Executing Discovery Intelligence..."

        );

        await this.collector.collect([]);

        await this.fusion.fuse([]);

        this.confidence.evaluate(0);

        console.log(

            "Discovery Intelligence Complete."

        );

    }

}
