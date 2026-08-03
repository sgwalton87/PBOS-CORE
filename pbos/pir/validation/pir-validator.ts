/*
===============================================================================

PBOS PIR Validator

Authority

PBOS-PIR-007

===============================================================================

Purpose

Validate Intermediate Representation artifacts before they enter the compiler.

The validator SHALL fail closed.

===============================================================================
*/

import { PirArtifact }

from "../artifacts/pir-artifact";

export class PirValidator {

    validate(

        artifact: PirArtifact

    ): boolean {

        return (

            artifact.id.length > 0 &&

            artifact.version.length > 0 &&

            artifact.producer.length > 0

        );

    }

}
