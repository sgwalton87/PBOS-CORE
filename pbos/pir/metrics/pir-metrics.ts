/*
===============================================================================

PBOS PIR Metrics

Authority

PBOS-PIR-011

===============================================================================
*/

export interface PirMetrics {

    readonly artifactCount: number;

    readonly evolutionCount: number;

    readonly validationFailures: number;

    readonly serializationOperations: number;

    readonly compilerStages: number;

}

export class PirMetricsCollector {

    create(): PirMetrics {

        return {

            artifactCount: 0,

            evolutionCount: 0,

            validationFailures: 0,

            serializationOperations: 0,

            compilerStages: 0

        };

    }

}
