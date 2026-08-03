import { CompilerArtifact }

from "../contracts/compiler-artifact";

export interface EvidenceArtifact

extends CompilerArtifact {

    readonly artifactType:

        "EVIDENCE";

    readonly source: string;

    readonly confidence: number;

    readonly evidenceType: string;

    readonly content: unknown;

}
