import { randomUUID }

from "crypto";

import { CompilerContext }

from "../context/compiler-context";

import { PipelineStage }

from "./pipeline-stage";

import { SessionArtifact }

from "../../compiler-artifacts";

export class BootStage

implements PipelineStage {

    readonly id = "boot";

    readonly name = "Boot";

    readonly order = 1;

    async execute(

        context: CompilerContext

    ): Promise<void> {

        const artifact: SessionArtifact = {

            id: randomUUID(),

            artifactType: "SESSION",

            schemaVersion: "1.0.0",

            compilerVersion: "1.0.0",

            producedBy: "BootStage",

            producedAt: new Date(),

            sessionId: randomUUID(),

            lineageId: randomUUID(),

            metadata: {},

            organizationId: "unknown",

            executionId: randomUUID(),

            startedAt: new Date()

        };

        context.registerArtifact(

            artifact

        );

    }

}
