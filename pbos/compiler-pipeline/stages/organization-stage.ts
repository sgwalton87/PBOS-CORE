import { CompilerContext } from "../context/compiler-context";
import { PipelineStage } from "./pipeline-stage";

export class OrganizationStage implements PipelineStage {

    readonly id = "organization";

    readonly name = "Organization";

    readonly order = 40;

    async execute(
        context: CompilerContext
    ): Promise<void> {

        context.addArtifact(
            "organization-model"
        );

    }

}
