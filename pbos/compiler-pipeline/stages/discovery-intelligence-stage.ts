import { randomUUID } from "crypto";

import { CompilerContext } from "../context/compiler-context";
import { PipelineStage } from "./pipeline-stage";

import {
    EvidenceArtifact,
    KnowledgeGraphArtifact
} from "../../compiler-artifacts";

export class DiscoveryIntelligenceStage
    implements PipelineStage {

    readonly id = "discovery-intelligence";

    readonly name = "Discovery Intelligence";

    readonly order = 3;

    async execute(
        context: CompilerContext
    ): Promise<void> {

        const evidence =
            context.findArtifact<EvidenceArtifact>(
                "EVIDENCE"
            );

        if (!evidence) {

            throw new Error(
                "EvidenceArtifact missing."
            );

        }

        const graph: KnowledgeGraphArtifact = {

            id: randomUUID(),

            artifactType: "KNOWLEDGE_GRAPH",

            schemaVersion: "1.0.0",

            compilerVersion: "1.0.0",

            producedBy:
                "DiscoveryIntelligenceStage",

            producedAt:
                new Date(),

            sessionId:
                evidence.sessionId,

            lineageId:
                randomUUID(),

            metadata: {},

            nodes: [],

            edges: [],

            ontologyVersion: "1.0.0"

        };

        context.registerArtifact(
            graph
        );

    }

}