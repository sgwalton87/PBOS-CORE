/*
===============================================================================

PBOS Execution Artifact

Authority

PBOS-CIP-007B-001

Classification

Compiler Artifact

===============================================================================
*/


import {

    ExecutionModel

}

from "../../execution-engine";



export interface ExecutionArtifact {


    readonly id: string;


    readonly artifactType:

        "EXECUTION";


    readonly schemaVersion: string;


    readonly compilerVersion: string;


    readonly producedBy: string;


    readonly producedAt: Date;


    readonly sessionId: string;


    readonly lineageId: string;


    readonly metadata: Record<string, unknown>;


    readonly executionModel:

        ExecutionModel;


}
