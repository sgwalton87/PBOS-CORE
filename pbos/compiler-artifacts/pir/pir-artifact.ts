import { CompilerArtifact }

from "../contracts/compiler-artifact";

export interface PirArtifact

extends CompilerArtifact {

    readonly artifactType:

        "PIR";

    readonly representationVersion: string;

    readonly compilerPasses: readonly string[];

    readonly organizationModel: unknown;

}
