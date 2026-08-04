import { randomUUID } from "crypto";
import { EvolutionArtifact, GovernanceArtifact } from "../../compiler-artifacts";
import { GovernanceRuntime } from "../../governance-engine";
import { CompilationStage, CompilationStageOutput } from "../contracts/compilation-stage";

export class GovernanceStage implements CompilationStage {
    readonly id = "governance";
    readonly order = 8;
    readonly requiredInputs = ["EVOLUTION"] as const;
    readonly producedOutputs = ["GOVERNANCE"] as const;
    readonly lifecycleState = "VALIDATING" as const;

    constructor(private readonly runtime = new GovernanceRuntime()) {}

    execute(context: Parameters<CompilationStage["execute"]>[0]): CompilationStageOutput {
        const evolution = context.artifacts.find(candidate => candidate.artifactType === "EVOLUTION") as EvolutionArtifact | undefined;
        if (!evolution) throw new Error("EvolutionArtifact missing.");
        const model = this.runtime.compile(evolution.evolutionModel.id);
        const artifact: GovernanceArtifact = {
            id: randomUUID(), artifactType: "GOVERNANCE", schemaVersion: "1.0.0",
            compilerVersion: "1.0.0", producedBy: "GovernanceStage", producedAt: new Date(),
            sessionId: context.jobId, lineageId: context.jobId,
            metadata: { parentArtifactId: evolution.id }, governanceModel: model
        };
        return { artifacts: [artifact] };
    }
}
