/*
===============================================================================

PBOS PIR Lineage

Authority

PBOS-PIR-009

===============================================================================

Purpose

Track immutable compiler lineage across every PIR evolution.

===============================================================================
*/

export interface PirLineage {

    readonly artifactId: string;

    readonly parentArtifactId?: string;

    readonly compilerStage: string;

    readonly timestamp: Date;

}

export class PirLineageTracker {

    create(

        artifactId: string,

        compilerStage: string,

        parentArtifactId?: string

    ): PirLineage {

        return {

            artifactId,

            parentArtifactId,

            compilerStage,

            timestamp:

                new Date()

        };

    }

}
