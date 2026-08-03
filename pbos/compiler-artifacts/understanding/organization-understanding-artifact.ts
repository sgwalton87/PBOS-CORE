import { CompilerArtifact }

from "../contracts/compiler-artifact";

export interface OrganizationUnderstandingArtifact

extends CompilerArtifact {

    readonly artifactType:

        "ORGANIZATION_UNDERSTANDING";

    readonly summary: string;

    readonly capabilities: readonly string[];

    readonly objectives: readonly string[];

    readonly constraints: readonly string[];

    readonly assumptions: readonly string[];

}
