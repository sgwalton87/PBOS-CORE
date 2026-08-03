import { CompilerArtifact }
    from "../../compiler-artifacts";

export interface StageResult {

    readonly stageId: string;

    readonly stageName: string;

    readonly success: boolean;

    readonly startedAt: Date;

    readonly completedAt: Date;

    readonly durationMs: number;

    readonly artifacts: readonly CompilerArtifact[];

    readonly diagnostics: readonly string[];

}