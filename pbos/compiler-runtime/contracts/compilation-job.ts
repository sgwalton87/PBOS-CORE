import { RegisteredSystem } from "../../acquisition-engine";
import {
    CompilationArtifact,
    CompilationLineageRecord
} from "./compilation-stage";
import {
    CompilationState,
    CompilationStateTransition
} from "./compilation-state";

export interface CompilationError {
    readonly stageId: string;
    readonly message: string;
    readonly occurredAt: Date;
}

export interface CompilationJob {
    readonly jobId: string;
    readonly targetSystemId: string;
    readonly target: RegisteredSystem;
    readonly lifecycleState: CompilationState;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly inputArtifacts: readonly CompilationArtifact[];
    readonly outputArtifacts: readonly CompilationArtifact[];
    readonly lineage: readonly CompilationLineageRecord[];
    readonly stateTransitions: readonly CompilationStateTransition[];
    readonly errors: readonly CompilationError[];
}
