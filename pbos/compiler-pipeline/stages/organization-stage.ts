import { randomUUID } from "crypto";

import {
    CompilerContext
} from "../context/compiler-context";

import {
    PipelineStage
} from "./pipeline-stage";

import {
    KnowledgeGraphArtifact,
    OrganizationUnderstandingArtifact
} from "../../compiler-artifacts";

export class OrganizationStage
implements PipelineStage {

    readonly id = "organization";

    readonly name = "Organization";

    readonly order = 4;

    async execute(
        context: CompilerContext
    ): Promise<void> {

        const graph =
            context.findArtifact<KnowledgeGraphArtifact>(
                "KNOWLEDGE_GRAPH"
            );

        if (!graph) {

            throw new Error(
                "KnowledgeGraphArtifact missing."
            );

        }

        const understanding:
        OrganizationUnderstandingArtifact = {

            id: randomUUID(),

            artifactType:
                "ORGANIZATION_UNDERSTANDING",

            schemaVersion: "1.0.0",

            compilerVersion: "1.0.0",

            producedBy:
                "OrganizationStage",

            producedAt: new Date(),

            sessionId:
                graph.sessionId,

            lineageId:
                randomUUID(),

            metadata: {},

            summary:
                "Initial organizational understanding.",

            capabilities: [],

            objectives: [],

            constraints: [],

            assumptions: []

        };

        context.registerArtifact(
            understanding
        );

    }

}
