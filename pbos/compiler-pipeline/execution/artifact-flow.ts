/*
===============================================================================

PBOS Artifact Flow

Authority

PBOS-CIP-002B-001

Classification

Constitutional Execution

===============================================================================

Purpose

Coordinates immutable compiler artifacts flowing between compiler stages.

Stages SHALL consume artifacts, produce new artifacts, and register them
with the Compiler Context.

===============================================================================
*/

import { CompilerArtifact }
from "../../compiler-artifacts";

import { CompilerContext }
from "../context/compiler-context";

export class ArtifactFlow {

    publish(

        context: CompilerContext,

        artifact: CompilerArtifact

    ): void {

        context.registerArtifact(

            artifact

        );

    }

    latest<T extends CompilerArtifact>(

        context: CompilerContext,

        artifactType: string

    ): T | undefined {

        return context.findArtifact<T>(

            artifactType

        );

    }

}
