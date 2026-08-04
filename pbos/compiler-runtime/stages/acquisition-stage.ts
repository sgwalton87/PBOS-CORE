import { CompilationStage, CompilationStageOutput } from "../contracts/compilation-stage";

export class AcquisitionStage implements CompilationStage {
    readonly id = "acquisition";
    readonly order = 1;
    readonly requiredInputs = ["REGISTERED_SYSTEM"] as const;
    readonly producedOutputs = ["SYSTEM"] as const;
    readonly lifecycleState = "ACQUIRING" as const;

    execute(context: Parameters<CompilationStage["execute"]>[0]): CompilationStageOutput {
        const artifact = context.artifacts.find(candidate => candidate.artifactType === "SYSTEM");
        if (!artifact) {
            throw new Error("Registered system artifact is required.");
        }
        return { artifacts: [artifact] };
    }
}
