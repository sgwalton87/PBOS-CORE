import { SystemArtifact } from "../../acquisition-engine";
import { CompilerArtifact } from "../../compiler-artifacts";
import { CompilationState } from "./compilation-state";

export type CompilationArtifact = SystemArtifact | CompilerArtifact;

export interface CompilationStageContext {
    readonly jobId: string;
    readonly targetSystemId: string;
    readonly artifacts: readonly CompilationArtifact[];
}

export interface CompilationStageOutput {
    readonly artifacts: readonly CompilationArtifact[];
}

export interface CompilationStage {
    readonly id: string;
    readonly order: number;
    readonly requiredInputs: readonly string[];
    readonly producedOutputs: readonly string[];
    readonly lifecycleState: CompilationState;
    execute(context: CompilationStageContext): CompilationStageOutput;
}

export interface CompilationLineageRecord {
    readonly stageId: string;
    readonly stageOrder: number;
    readonly inputArtifactIds: readonly string[];
    readonly outputArtifactIds: readonly string[];
    readonly lifecycleState: CompilationState;
    readonly startedAt: Date;
    readonly completedAt: Date;
}
