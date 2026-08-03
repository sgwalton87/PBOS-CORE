import { CompilerContext } from "../context/compiler-context";
import { PipelineStage } from "./pipeline-stage";

export class BootStage implements PipelineStage {

    readonly id = "boot";

    readonly name = "Boot";

    readonly order = 10;

    async execute(
        context: CompilerContext
    ): Promise<void> {

        context.set(
            "boot",
            true
        );

        context.addArtifact(
            "boot-complete"
        );

    }

}
