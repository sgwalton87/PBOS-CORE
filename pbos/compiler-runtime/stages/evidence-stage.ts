import { randomUUID } from "crypto";
import { EvidenceArtifact } from "../../compiler-artifacts";
import { EvidenceRecord, EvidenceRuntime } from "../../evidence-engine";
import { CompilationStage, CompilationStageOutput } from "../contracts/compilation-stage";

export class EvidenceStage implements CompilationStage {
    readonly id = "evidence";
    readonly order = 2;
    readonly requiredInputs = ["SYSTEM"] as const;
    readonly producedOutputs = ["EVIDENCE"] as const;
    readonly lifecycleState = "ANALYZING" as const;

    constructor(private readonly runtime = new EvidenceRuntime()) {}

    execute(context: Parameters<CompilationStage["execute"]>[0]): CompilationStageOutput {
        const system = context.artifacts.find(candidate => candidate.artifactType === "SYSTEM");
        if (!system || !("systemName" in system)) {
            throw new Error("SystemArtifact missing.");
        }
        const record: EvidenceRecord = {
            id: randomUUID(),
            type: "SYSTEM",
            status: "COLLECTED",
            source: {
                id: system.repositoryIdentity,
                type: "SYSTEM",
                name: system.systemName,
                description: "Registered system acquisition artifact",
                location: system.repositoryPath,
                verified: true,
                metadata: { commitHash: system.commitHash }
            },
            payload: system,
            collectedAt: new Date(),
            confidence: 1,
            metadata: { targetSystemId: context.targetSystemId }
        };
        const processed = this.runtime.process(record);
        if (!processed.valid) {
            throw new Error("System evidence failed validation.");
        }
        const artifact: EvidenceArtifact = {
            id: processed.evidence.id,
            artifactType: "EVIDENCE",
            schemaVersion: "1.0.0",
            compilerVersion: "1.0.0",
            producedBy: "EvidenceStage",
            producedAt: new Date(),
            sessionId: context.jobId,
            parentArtifactId: system.id,
            lineageId: context.jobId,
            metadata: processed.evidence.metadata,
            source: system.repositoryPath,
            confidence: processed.confidence,
            evidenceType: processed.evidence.type,
            content: processed.evidence.payload
        };
        return { artifacts: [artifact] };
    }
}
