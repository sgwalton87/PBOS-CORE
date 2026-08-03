/*
===============================================================================

PBOS Compiler Artifact Report

Authority

PBOS-ARTIFACT-007

Classification

Constitutional Reporting

===============================================================================
*/

export interface ArtifactReport {

    readonly reportId: string;

    readonly artifactId: string;

    readonly artifactType: string;

    readonly generatedAt: Date;

    readonly valid: boolean;

}

export class ArtifactReporter {

    create(

        artifactId: string,

        artifactType: string,

        valid: boolean

    ): ArtifactReport {

        return {

            reportId:

                crypto.randomUUID(),

            artifactId,

            artifactType,

            generatedAt:

                new Date(),

            valid

        };

    }

}
