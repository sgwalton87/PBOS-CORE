/*
===============================================================================

PBOS Evolution Artifact

Authority

PBOS-CIP-008B-001

Classification

Compiler Artifact

===============================================================================
*/


import {

    EvolutionModel

}

from "../../evolution-engine";



export interface EvolutionArtifact {


    readonly id: string;


    readonly artifactType:

        "EVOLUTION";


    readonly schemaVersion: string;


    readonly compilerVersion: string;


    readonly producedBy: string;


    readonly producedAt: Date;


    readonly sessionId: string;


    readonly lineageId: string;


    readonly metadata: Record<string, unknown>;


    readonly evolutionModel:

        EvolutionModel;


}
