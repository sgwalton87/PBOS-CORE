/*
===============================================================================

PBOS Intermediate Representation Evolution Engine

Authority

PBOS-PIR-010

Classification

Constitutional Evolution

===============================================================================

Purpose

Manage immutable evolution of the PBOS Intermediate Representation.

Every compiler stage SHALL consume a PIR Artifact and produce a new PIR
Artifact.

Existing artifacts SHALL remain immutable.

===============================================================================
*/

import { PirArtifact } from "../artifacts/pir-artifact";

export interface PirEvolutionRecord {

    readonly previousArtifactId: string;

    readonly nextArtifactId: string;

    readonly compilerStage: string;

    readonly timestamp: Date;

}

export class PirEvolutionEngine {

    evolve(

        previous: PirArtifact,

        next: PirArtifact,

        compilerStage: string

    ): PirEvolutionRecord {

        return {

            previousArtifactId: previous.id,

            nextArtifactId: next.id,

            compilerStage,

            timestamp: new Date()

        };

    }

}
