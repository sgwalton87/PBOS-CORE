import { CompilerArtifact }

from "../contracts/compiler-artifact";

export interface SessionArtifact

extends CompilerArtifact {

    readonly artifactType:

        "SESSION";

    readonly organizationId: string;

    readonly executionId: string;

    readonly startedAt: Date;

}
