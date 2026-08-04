import { randomUUID } from "crypto";
import { EvidenceArtifact, KnowledgeGraphArtifact } from "../../compiler-artifacts";
import { KnowledgeRuntime } from "../../knowledge-engine";
import { CompilationStage, CompilationStageOutput } from "../contracts/compilation-stage";

export class KnowledgeStage implements CompilationStage {
    readonly id = "knowledge";
    readonly order = 3;
    readonly requiredInputs = ["EVIDENCE"] as const;
    readonly producedOutputs = ["KNOWLEDGE_GRAPH"] as const;
    readonly lifecycleState = "ANALYZING" as const;

    constructor(private readonly runtime = new KnowledgeRuntime()) {}

    execute(context: Parameters<CompilationStage["execute"]>[0]): CompilationStageOutput {
        const evidence = context.artifacts.find(candidate => candidate.artifactType === "EVIDENCE") as EvidenceArtifact | undefined;
        if (!evidence) throw new Error("EvidenceArtifact missing.");
        const graph = this.runtime.compile(evidence);
        const artifact: KnowledgeGraphArtifact = {
            id: graph.id,
            artifactType: "KNOWLEDGE_GRAPH",
            schemaVersion: "1.0.0",
            compilerVersion: "1.0.0",
            producedBy: "KnowledgeStage",
            producedAt: graph.createdAt,
            sessionId: context.jobId,
            parentArtifactId: evidence.id,
            lineageId: context.jobId,
            metadata: { confidence: graph.confidence },
            nodes: graph.entities,
            edges: graph.relationships,
            ontologyVersion: "1.0.0"
        };
        return { artifacts: [artifact] };
    }
}
