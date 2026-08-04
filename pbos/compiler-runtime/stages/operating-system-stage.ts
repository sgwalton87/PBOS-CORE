import { randomUUID } from "crypto";
import { OperatingSystemArtifact, OrganizationArtifact } from "../../compiler-artifacts";
import { OperatingSystemRuntime } from "../../os-engine";
import { CompilationStage, CompilationStageOutput } from "../contracts/compilation-stage";

export class OperatingSystemStage implements CompilationStage {
    readonly id = "operating-system";
    readonly order = 5;
    readonly requiredInputs = ["ORGANIZATION"] as const;
    readonly producedOutputs = ["OPERATING_SYSTEM"] as const;
    readonly lifecycleState = "COMPILING" as const;

    constructor(private readonly runtime = new OperatingSystemRuntime()) {}

    execute(context: Parameters<CompilationStage["execute"]>[0]): CompilationStageOutput {
        const organization = context.artifacts.find(candidate => candidate.artifactType === "ORGANIZATION") as OrganizationArtifact | undefined;
        if (!organization) throw new Error("OrganizationArtifact missing.");
        const model = this.runtime.compile(
            organization.organizationModel.name,
            organization.organizationModel.id,
            organization.organizationModel.capabilities.map(capability => capability.id)
        );
        const artifact: OperatingSystemArtifact = {
            id: randomUUID(), artifactType: "OPERATING_SYSTEM", schemaVersion: "1.0.0",
            compilerVersion: "1.0.0", producedBy: "OperatingSystemStage", producedAt: new Date(),
            sessionId: context.jobId, lineageId: context.jobId,
            metadata: { parentArtifactId: organization.id }, operatingSystemModel: model
        };
        return { artifacts: [artifact] };
    }
}
