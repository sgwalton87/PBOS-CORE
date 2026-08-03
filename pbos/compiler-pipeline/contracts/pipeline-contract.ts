/*
===============================================================================

PBOS Compiler Pipeline Contract

Authority

PBOS-PIPELINE-002

Classification

Constitutional Contract

===============================================================================

Purpose

Defines the constitutional execution contract for the PBOS Compiler Pipeline.

Every compiler stage SHALL execute through this pipeline.

===============================================================================
*/

import { CompilerContext } from "../context/compiler-context";
import { PipelineReport } from "../reporting/pipeline-report";

export interface CompilerPipelineContract {

    initialize(): Promise<void>;

    execute(

        context: CompilerContext

    ): Promise<PipelineReport>;

}
