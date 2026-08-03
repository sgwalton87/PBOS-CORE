import { CompilerContext } from "../context/compiler-context";
import { PipelineStage } from "./pipeline-stage";

export class DiscoveryIntelligenceStage implements PipelineStage {

    readonly id = "discovery-intelligence";

    readonly name = "Discovery Intelligence";

    readonly order = 30;

    async execute(
        context: CompilerContext
    ): Promise<void> {

        context.addArtifact(
            "organizational-understanding"
        );

    }

}
