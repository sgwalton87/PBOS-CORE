/*
===============================================================================

PBOS Compiler Artifact Serializer

Authority

PBOS-ARTIFACT-005

===============================================================================
*/

import { CompilerArtifact }

from "../contracts/compiler-artifact";

export class ArtifactSerializer {

    serialize(

        artifact: CompilerArtifact

    ): string {

        return JSON.stringify(

            artifact,

            null,

            2

        );

    }

    deserialize<T extends CompilerArtifact>(

        json: string

    ): T {

        return JSON.parse(

            json

        ) as T;

    }

}
