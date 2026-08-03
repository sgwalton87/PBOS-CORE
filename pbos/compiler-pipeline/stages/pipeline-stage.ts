/*
===============================================================================

PBOS Pipeline Stage

Authority

PBOS-PIPELINE-004

===============================================================================
*/

import { CompilerContext } from "../context/compiler-context";

export interface PipelineStage {

    readonly id: string;

    readonly name: string;

    readonly order: number;

    execute(

        context: CompilerContext

    ): Promise<void>;

}
