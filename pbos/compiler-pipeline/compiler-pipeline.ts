import { randomUUID } from "crypto";

import { CompilerContext }

from "./context/compiler-context";

import { PipelineReport }

from "./reporting/pipeline-report";

import { PipelineRuntime }

from "./runtime/pipeline-runtime";

import { StageLoader }

from "./runtime/stage-loader";

import { StageExecutor }

from "./runtime/stage-executor";

export class CompilerPipeline {

    private readonly runtime =

        new PipelineRuntime();

    async execute(): Promise<PipelineReport> {

        await this.runtime.initialize();

        this.runtime.begin();

        const startedAt =

            new Date();

        const loader =

            new StageLoader();

        const registry =

            loader.load();

        const executor =

            new StageExecutor();

        const context =

            new CompilerContext();

        const results = [];

        for (

            const stage

            of registry.getAll()

        ) {

            results.push(

                await executor.execute(

                    stage,

                    context

                )

            );

        }

        this.runtime.complete();

        return {

            pipelineId:

                randomUUID(),

            startedAt,

            completedAt:

                new Date(),

            success: true,

            stageCount:

                results.length,

            stages: results

        };

    }

}
