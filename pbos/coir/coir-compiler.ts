import { randomUUID } from "crypto";

import {
    CoirArtifact,
    PirArtifact
} from "../compiler-artifacts";

export class CoirCompiler {

    compile(
        pir: PirArtifact
    ): CoirArtifact {

        return {

            id: randomUUID(),

            artifactType: "COIR",

            schemaVersion: "1.0.0",

            compilerVersion: "1.0.0",

            producedBy:
                "CoirCompiler",

            producedAt: new Date(),

            sessionId:
                pir.sessionId,

            lineageId:
                randomUUID(),

            metadata: {},

            canonicalOrganization: {},

            certificationLevel:
                "DRAFT",

            compiledBy:
                "PBOS Genesis"

        };

    }

}
