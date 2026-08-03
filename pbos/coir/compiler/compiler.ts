/*
===============================================================================

PBOS Canonical Organization Compiler

Authority

PBOS-COIR-004

===============================================================================
*/

import { PirArtifact } from "../../pir";

export class CanonicalOrganizationCompiler {

    async compile(

        artifact: PirArtifact

    ): Promise<PirArtifact> {

        console.log(

            "Producing Canonical Organizational Representation..."

        );

        return artifact;

    }

}
