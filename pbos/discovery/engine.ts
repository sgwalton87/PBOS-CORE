/*
===============================================================================

PBOS Constitutional Discovery Engine

The Discovery Engine transforms incomplete organizational knowledge into
constitutional organizational understanding.

It SHALL NEVER invent organizational truth.

===============================================================================
*/

import { DiscoveryContract } from "./contracts/discovery-contract";

export class DiscoveryEngine {

    constructor(
        readonly contract: DiscoveryContract
    ) {}

    async discover() {

        throw new Error(
            "PBOS Discovery Engine has not yet been implemented."
        );

    }

    async interviewFounder() {

        throw new Error(
            "Founder Interview Engine not implemented."
        );

    }

    async buildOrganizationGenome() {

        throw new Error(
            "Organization Genome Builder not implemented."
        );

    }

    async buildKnowledgeGraph() {

        throw new Error(
            "Knowledge Graph Builder not implemented."
        );

    }

    async calculateOrganizationalUnderstandingIndex() {

        throw new Error(
            "OUI Engine not implemented."
        );

    }

    async generateDiscoveryPackage() {

        throw new Error(
            "Discovery Package Generator not implemented."
        );

    }

    async certifyDiscovery() {

        throw new Error(
            "Discovery Certification Engine not implemented."
        );

    }

}
