/*
===============================================================================

PBOS PIR Serializer

Authority

PBOS-PIR-008

===============================================================================
*/

import { PirArtifact }

from "../artifacts/pir-artifact";

export class PirSerializer {

    serialize(

        artifact: PirArtifact

    ): string {

        return JSON.stringify(

            artifact,

            null,

            2

        );

    }

    deserialize(

        json: string

    ): PirArtifact {

        return JSON.parse(json);

    }

}
