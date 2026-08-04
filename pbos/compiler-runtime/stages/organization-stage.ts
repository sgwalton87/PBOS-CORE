import { randomUUID } from "crypto";
import { KnowledgeGraphArtifact, OrganizationArtifact } from "../../compiler-artifacts";
import { OrganizationRuntime } from "../../organization-engine";
import { CompilationStage, CompilationStageOutput } from "../contracts/compilation-stage";

export class OrganizationStage implements CompilationStage {
    readonly id = "organization";
    readonly order = 4;
    readonly requiredInputs = ["KNOWLEDGE_GRAPH"] as const;
    readonly producedOutputs = ["ORGANIZATION"] as const;
    readonly lifecycleState = "COMPILING" as const;

    constructor(private readonly runtime = new OrganizationRuntime()) {}

    execute(context: Parameters<CompilationStage["execute"]>[0]): CompilationStageOutput {
        const graph = context.artifacts.find(candidate => candidate.artifactType === "KNOWLEDGE_GRAPH") as KnowledgeGraphArtifact | undefined;
        if (!graph) throw new Error("KnowledgeGraphArtifact missing.");
        const model = this.runtime.compile(context.targetSystemId, graph.nodes.map(node => String((node as { id?: unknown }).id ?? graph.id)));
        const artifact: OrganizationArtifact = {
            id: randomUUID(), artifactType: "ORGANIZATION", schemaVersion: "1.0.0",
            compilerVersion: "1.0.0", producedBy: "OrganizationStage", producedAt: new Date(),
            sessionId: context.jobId, lineageId: context.jobId,
            metadata: { parentArtifactId: graph.id }, organizationModel: model
        };
        return { artifacts: [artifact] };
    }
}
