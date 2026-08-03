import { CompilerArtifact }

from "../contracts/compiler-artifact";

export interface KnowledgeGraphArtifact

extends CompilerArtifact {

    readonly artifactType:

        "KNOWLEDGE_GRAPH";

    readonly nodes: readonly unknown[];

    readonly edges: readonly unknown[];

    readonly ontologyVersion: string;

}
