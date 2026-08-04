import { randomUUID } from "crypto";
import { EvolutionArtifact, ExecutionArtifact } from "../../compiler-artifacts";
import { EvolutionRuntime } from "../../evolution-engine";
import { CompilationStage, CompilationStageOutput } from "../contracts/compilation-stage";

export class EvolutionStage implements CompilationStage {
    readonly id = "evolution";
    readonly order = 7;
    readonly requiredInputs = ["EXECUTION"] as const;
    readonly producedOutputs = ["EVOLUTION"] as const;
    readonly lifecycleState = "COMPILING" as const;

    constructor(private readonly runtime = new EvolutionRuntime()) {}

    execute(context: Parameters<CompilationStage["execute"]>[0]): CompilationStageOutput {
        const execution = context.artifacts.find(candidate => candidate.artifactType === "EXECUTION") as ExecutionArtifact | undefined;
        if (!execution) throw new Error("ExecutionArtifact missing.");
        const model = this.runtime.compile(execution.executionModel.id);
        const artifact: EvolutionArtifact = {
            id: randomUUID(), artifactType: "EVOLUTION", schemaVersion: "1.0.0",
            compilerVersion: "1.0.0", producedBy: "EvolutionStage", producedAt: new Date(),
            sessionId: context.jobId, lineageId: context.jobId,
            metadata: { parentArtifactId: execution.id }, evolutionModel: model
        };
        return { artifacts: [artifact] };
    }
}
