export interface CoirLineage {

    readonly organizationId: string;

    readonly pirArtifactId: string;

    readonly compiledAt: Date;

    readonly compilerVersion: string;

}

export class CoirLineageTracker {

    create(

        organizationId: string,

        pirArtifactId: string

    ): CoirLineage {

        return {

            organizationId,

            pirArtifactId,

            compiledAt: new Date(),

            compilerVersion: "1.0.0"

        };

    }

}
