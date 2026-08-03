import { randomUUID } from "crypto";

import { EvidenceSource }
    from "../../evidence-engine";

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


        const source: EvidenceSource = {


            id:

                "discovery-source",


            type:

                "DOCUMENT",


            name:

                "Discovery Input",


            description:

                "Primary discovery evidence source",


            verified:

                true,


            metadata: {}

        };


        const collected =

            context.evidenceRuntime

                .process({

                    id:

                        randomUUID(),


                    type:

                        "DOCUMENT",


                    status:

                        "COLLECTED",


                    source,


                    payload: {

                        sessionId:

                            session.sessionId,


                        discovery:

                            "Initial discovery evidence"

                    },


                    collectedAt:

                        new Date(),


                    confidence:

                        0,


                    metadata: {}

                });



        const artifact: EvidenceArtifact = {


            id:

                randomUUID(),


            artifactType:

                "EVIDENCE",


            schemaVersion:

                "1.0.0",


            compilerVersion:

                "1.0.0",


            producedBy:

                "DiscoveryStage",


            producedAt:

                new Date(),


            sessionId:

                session.sessionId,


            lineageId:

                randomUUID(),


            metadata: {

                validated:

                    collected.valid

            },


            source:

                "evidence-engine",


            confidence:

                collected.confidence,


            evidenceType:

                "DISCOVERY",


            content:

                collected.evidence.payload

        };


        context.registerArtifact(

            artifact

        );

    }

}
