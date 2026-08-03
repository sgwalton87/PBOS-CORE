/*
===============================================================================

PBOS Discovery Report

Authority

PBOS-DI-011

===============================================================================
*/

import { ConfidenceScore }
from "../confidence/confidence-engine";

export interface DiscoveryReport {

    readonly reportId: string;

    readonly organizationId: string;

    readonly createdAt: Date;

    readonly confidence: ConfidenceScore;

    readonly summary: string;

}

export class DiscoveryReportBuilder {

    build(

        organizationId: string,

        confidence: ConfidenceScore

    ): DiscoveryReport {

        return {

            reportId: crypto.randomUUID(),

            organizationId,

            createdAt: new Date(),

            confidence,

            summary:

                "Discovery completed successfully."

        };

    }

}
