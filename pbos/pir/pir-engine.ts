import { randomUUID } from "crypto";

import {
    OrganizationUnderstandingArtifact,
    PirArtifact
} from "../compiler-artifacts";

export class PirEngine {

    compile(
        understanding:
        OrganizationUnderstandingArtifact
    ): PirArtifact {

        return {

            id: randomUUID(),

            artifactType: "PIR",

            schemaVersion: "1.0.0",

            compilerVersion: "1.0.0",

            producedBy:
                "PirEngine",

            producedAt: new Date(),

            sessionId:
                understanding.sessionId,

            lineageId:
                randomUUID(),

            metadata: {},

            representationVersion:
                "1.0.0",

            compilerPasses: [

                "organization"

            ],

            organizationModel: {}

        };

    }

}
