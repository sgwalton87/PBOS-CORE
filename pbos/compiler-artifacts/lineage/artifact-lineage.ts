/*
===============================================================================

PBOS Compiler Artifact Lineage

Authority

PBOS-ARTIFACT-006

Classification

Constitutional Lineage

===============================================================================
*/

export interface ArtifactLineage {

    readonly lineageId: string;

    readonly artifactId: string;

    readonly parentArtifactId?: string;

    readonly producedBy: string;

    readonly compilerStage: string;

    readonly compilerVersion: string;

    readonly producedAt: Date;

}

export class ArtifactLineageTracker {

    create(

        lineage: ArtifactLineage

    ): ArtifactLineage {

        return {

            ...lineage

        };

    }

}
