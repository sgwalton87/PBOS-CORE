import { CompilerContext } from "../context/compiler-context";
import { PipelineStage } from "./pipeline-stage";

export class DiscoveryStage implements PipelineStage {

    readonly id = "discover";

    readonly name = "Discovery";

    readonly order = 20;

    async execute(
        context: CompilerContext
    ): Promise<void> {

        context.addArtifact(
            "discovery-session"
        );

    }

}
