import { randomUUID }

from "crypto";

import { CompilerContext }

from "../context/compiler-context";

import { PipelineStage }

from "./pipeline-stage";

import {

    EvidenceArtifact,

    SessionArtifact

}

from "../../compiler-artifacts";

export class DiscoveryStage

implements PipelineStage {

    readonly id = "discover";

    readonly name = "Discovery";

    readonly order = 2;

    async execute(

        context: CompilerContext

    ): Promise<void> {

        const session =

            context.findArtifact<SessionArtifact>(

                "SESSION"

            );

        if (!session) {

            throw new Error(

                "SessionArtifact missing."

            );

        }

        const artifact: EvidenceArtifact = {

            id: randomUUID(),

            artifactType: "EVIDENCE",

            schemaVersion: "1.0.0",

            compilerVersion: "1.0.0",

            producedBy: "DiscoveryStage",

            producedAt: new Date(),

            sessionId: session.sessionId,

            lineageId: randomUUID(),

            metadata: {},

            source: "interactive",

            confidence: 1.0,

            evidenceType: "DISCOVERY",

            content: {}

        };

        context.registerArtifact(

            artifact

        );

    }

}
