import { randomUUID } from "crypto";
import { RegisteredSystem } from "../../acquisition-engine";
import { GovernanceArtifact } from "../../compiler-artifacts";
import { CompilationJob } from "../contracts/compilation-job";
import { CompilationResult } from "../contracts/compilation-result";
import {
    CompilationArtifact,
    CompilationStage
} from "../contracts/compilation-stage";
import { CompilationState } from "../contracts/compilation-state";
import { AcquisitionStage } from "../stages/acquisition-stage";
import { EvidenceStage } from "../stages/evidence-stage";
import { KnowledgeStage } from "../stages/knowledge-stage";
import { OrganizationStage } from "../stages/organization-stage";
import { OperatingSystemStage } from "../stages/operating-system-stage";
import { ExecutionStage } from "../stages/execution-stage";
import { EvolutionStage } from "../stages/evolution-stage";
import { GovernanceStage } from "../stages/governance-stage";

const DEFAULT_STAGES: readonly CompilationStage[] = [
    new AcquisitionStage(),
    new EvidenceStage(),
    new KnowledgeStage(),
    new OrganizationStage(),
    new OperatingSystemStage(),
    new ExecutionStage(),
    new EvolutionStage(),
    new GovernanceStage()
];

export class CompilationOrchestrator {
    private readonly stages: readonly CompilationStage[];

    constructor(stages: readonly CompilationStage[] = DEFAULT_STAGES) {
        this.stages = [...stages].sort((left, right) => left.order - right.order);
        this.assertDeterministicStages();
    }

    compile(target: RegisteredSystem): CompilationResult {
        const createdAt = new Date();
        let job: CompilationJob = {
            jobId: randomUUID(),
            targetSystemId: target.systemId,
            target,
            lifecycleState: "INITIALIZED",
            createdAt,
            updatedAt: createdAt,
            inputArtifacts: [target.artifact],
            outputArtifacts: [],
            lineage: [],
            stateTransitions: [{ to: "INITIALIZED", transitionedAt: createdAt }],
            errors: []
        };

        for (const stage of this.stages) {
            const startedAt = new Date();
            job = this.transition(job, stage.lifecycleState, stage.id, startedAt);
            try {
                this.assertRequiredInputs(stage, [target.artifact, ...job.outputArtifacts]);
                const output = stage.execute({
                    jobId: job.jobId,
                    targetSystemId: job.targetSystemId,
                    artifacts: [target.artifact, ...job.outputArtifacts]
                });
                this.assertProducedOutputs(stage, output.artifacts);
                const completedAt = new Date();
                job = {
                    ...job,
                    updatedAt: completedAt,
                    outputArtifacts: [...job.outputArtifacts, ...output.artifacts],
                    lineage: [...job.lineage, {
                        stageId: stage.id,
                        stageOrder: stage.order,
                        inputArtifactIds: this.inputIds(stage, [target.artifact, ...job.outputArtifacts]),
                        outputArtifactIds: output.artifacts.map(artifact => artifact.id),
                        lifecycleState: stage.lifecycleState,
                        startedAt,
                        completedAt
                    }]
                };
            } catch (error) {
                const failedAt = new Date();
                job = this.transition({
                    ...job,
                    errors: [...job.errors, {
                        stageId: stage.id,
                        message: error instanceof Error ? error.message : String(error),
                        occurredAt: failedAt
                    }]
                }, "FAILED", stage.id, failedAt);
                return { success: false, job };
            }
        }

        job = this.transition(job, "CERTIFIED", "governance", new Date());
        const governanceArtifact = [...job.outputArtifacts]
            .reverse()
            .find(artifact => artifact.artifactType === "GOVERNANCE") as GovernanceArtifact | undefined;
        if (!governanceArtifact) {
            const failedAt = new Date();
            job = this.transition({
                ...job,
                errors: [...job.errors, {
                    stageId: "governance",
                    message: "Governance certification artifact missing.",
                    occurredAt: failedAt
                }]
            }, "FAILED", "governance", failedAt);
            return { success: false, job };
        }
        return {
            success: true,
            job,
            compiledArtifact: {
                id: job.jobId,
                artifactType: "COMPILED_PBOS_SYSTEM",
                schemaVersion: "1.0.0",
                targetSystemId: job.targetSystemId,
                sourceArtifact: target.artifact,
                artifacts: job.outputArtifacts,
                governanceArtifact,
                lineage: job.lineage,
                compiledAt: job.updatedAt
            }
        };
    }

    private transition(job: CompilationJob, to: CompilationState, stageId: string, at: Date): CompilationJob {
        return {
            ...job,
            lifecycleState: to,
            updatedAt: at,
            stateTransitions: [...job.stateTransitions, {
                from: job.lifecycleState,
                to,
                stageId,
                transitionedAt: at
            }]
        };
    }

    private assertDeterministicStages(): void {
        const identities = new Set(this.stages.map(stage => stage.id));
        const orders = new Set(this.stages.map(stage => stage.order));
        if (identities.size !== this.stages.length || orders.size !== this.stages.length) {
            throw new Error("Compilation stages require unique identities and execution orders.");
        }
    }

    private assertRequiredInputs(stage: CompilationStage, artifacts: readonly CompilationArtifact[]): void {
        const available = new Set(artifacts.map(artifact => artifact.artifactType));
        for (const required of stage.requiredInputs) {
            if (required === "REGISTERED_SYSTEM") continue;
            if (!available.has(required)) throw new Error(`${required} input missing for ${stage.id}.`);
        }
    }

    private assertProducedOutputs(stage: CompilationStage, artifacts: readonly CompilationArtifact[]): void {
        const produced = new Set(artifacts.map(artifact => artifact.artifactType));
        for (const required of stage.producedOutputs) {
            if (!produced.has(required)) throw new Error(`${stage.id} did not produce ${required}.`);
        }
    }

    private inputIds(stage: CompilationStage, artifacts: readonly CompilationArtifact[]): readonly string[] {
        if (stage.requiredInputs.includes("REGISTERED_SYSTEM")) return [artifacts[0].id];
        return artifacts
            .filter(artifact => stage.requiredInputs.includes(artifact.artifactType))
            .map(artifact => artifact.id);
    }
}
