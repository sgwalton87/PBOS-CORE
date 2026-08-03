/*
===============================================================================

PBOS PIR Registry

Authority

PBOS-PIR-006

Classification

Constitutional Registry

===============================================================================

Purpose

The PIR Registry maintains the canonical inventory of all Intermediate
Representation artifacts produced during compilation.

Artifacts SHALL be immutable once registered.

===============================================================================
*/

import { PirArtifact } from "../artifacts/pir-artifact";

export class PirRegistry {

    private readonly artifacts =

        new Map<string, PirArtifact>();

    register(

        artifact: PirArtifact

    ): void {

        this.artifacts.set(

            artifact.id,

            artifact

        );

    }

    get(

        id: string

    ): PirArtifact | undefined {

        return this.artifacts.get(id);

    }

    getAll(): readonly PirArtifact[] {

        return [

            ...this.artifacts.values()

        ];

    }

}
