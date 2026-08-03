import { randomUUID } from "crypto";

import { CompilerContext } from "./context/compiler-context";
import { PipelineReport } from "./reporting/pipeline-report";

import { PipelineRuntime } from "./runtime/pipeline-runtime";
import { StageLoader } from "./runtime/stage-loader";
import { StageExecutor } from "./runtime/stage-executor";

import { ContextBuilder } from "./execution/context-builder";

import { PirEngine } from "../pir/pir-engine";
import { CoirCompiler } from "../coir/coir-compiler";

import {
    OrganizationUnderstandingArtifact,
    PirArtifact,
    CoirArtifact
} from "../compiler-artifacts";

export class CompilerPipeline {

    private readonly runtime =
        new PipelineRuntime();

    async execute(): Promise<PipelineReport> {

        await this.runtime.initialize();

        this.runtime.begin();

        const startedAt = new Date();

        const context =
            new ContextBuilder().build();

        const registry =
            new StageLoader().load();

        const executor =
            new StageExecutor();

        const results = [];

        for (const stage of registry.getAll()) {

            results.push(

                await executor.execute(
                    stage,
                    context
                )

            );

        }

        const understanding =
            context.findArtifact<
                OrganizationUnderstandingArtifact
            >("ORGANIZATION_UNDERSTANDING");

        if (!understanding) {

            throw new Error(
                "Organization understanding missing."
            );

        }

        const pirEngine =
            new PirEngine();

        const pir: PirArtifact =
            pirEngine.compile(
                understanding
            );

        context.registerArtifact(
            pir
        );

        const compiler =
            new CoirCompiler();

        const coir: CoirArtifact =
            compiler.compile(
                pir
            );

        context.registerArtifact(
            coir
        );

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
