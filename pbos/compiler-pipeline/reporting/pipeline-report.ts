import { StageResult }

from "../runtime/stage-result";

import {

    CompilerArtifact

}

from "../../compiler-artifacts";

export interface PipelineReport {

    readonly pipelineId: string;

    readonly startedAt: Date;

    readonly completedAt: Date;

    readonly success: boolean;

    readonly stageCount: number;

    readonly stages: readonly StageResult[];

    readonly artifacts?: readonly CompilerArtifact[];

}
