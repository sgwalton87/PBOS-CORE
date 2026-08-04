import { randomUUID } from "crypto";
import { ExecutionArtifact, OperatingSystemArtifact } from "../../compiler-artifacts";
import { ExecutionRuntime } from "../../execution-engine";
import { CompilationStage, CompilationStageOutput } from "../contracts/compilation-stage";

export class ExecutionStage implements CompilationStage {
    readonly id = "execution";
    readonly order = 6;
    readonly requiredInputs = ["OPERATING_SYSTEM"] as const;
    readonly producedOutputs = ["EXECUTION"] as const;
    readonly lifecycleState = "COMPILING" as const;

    constructor(private readonly runtime = new ExecutionRuntime()) {}

    execute(context: Parameters<CompilationStage["execute"]>[0]): CompilationStageOutput {
        const os = context.artifacts.find(candidate => candidate.artifactType === "OPERATING_SYSTEM") as OperatingSystemArtifact | undefined;
        if (!os) throw new Error("OperatingSystemArtifact missing.");
        const model = this.runtime.compile(os.operatingSystemModel.name, os.operatingSystemModel.id);
        const artifact: ExecutionArtifact = {
            id: randomUUID(), artifactType: "EXECUTION", schemaVersion: "1.0.0",
            compilerVersion: "1.0.0", producedBy: "ExecutionStage", producedAt: new Date(),
            sessionId: context.jobId, lineageId: context.jobId,
            metadata: { parentArtifactId: os.id }, executionModel: model
        };
        return { artifacts: [artifact] };
    }
}
