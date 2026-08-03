/*
===============================================================================

PBOS PIR Report

Authority

PBOS-PIR-012

===============================================================================
*/

import { PirMetrics }

from "../metrics/pir-metrics";

export interface PirReport {

    readonly reportId: string;

    readonly generatedAt: Date;

    readonly metrics: PirMetrics;

    readonly successful: boolean;

}

export class PirReporter {

    generate(

        metrics: PirMetrics

    ): PirReport {

        return {

            reportId:

                crypto.randomUUID(),

            generatedAt:

                new Date(),

            metrics,

            successful: true

        };

    }

}
