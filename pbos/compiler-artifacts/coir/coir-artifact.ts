import { CompilerArtifact }

from "../contracts/compiler-artifact";

export interface CoirArtifact

extends CompilerArtifact {

    readonly artifactType:

        "COIR";

    readonly canonicalOrganization: unknown;

    readonly certificationLevel: string;

    readonly compiledBy: string;

}
