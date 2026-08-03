/*
===============================================================================

PBOS Stage Executor

Authority

PBOS-CIP-004

===============================================================================
*/

import { CompilerContext }

from "../context/compiler-context";

import { PipelineStage }

from "../stages/pipeline-stage";

import { StageResult }

from "./stage-result";

export class StageExecutor {

    async execute(

        stage: PipelineStage,

        context: CompilerContext

    ): Promise<StageResult> {

        const startedAt =

            new Date();

        await stage.execute(

            context

        );

        const completedAt =

            new Date();

        return {

            stageId:

                stage.id,

            stageName:

                stage.name,

            success: true,

            startedAt,

            completedAt,

            durationMs:

                completedAt.getTime() -

                startedAt.getTime(),

            artifacts:

                [...context.artifacts],

            diagnostics: []

        };

    }

}
