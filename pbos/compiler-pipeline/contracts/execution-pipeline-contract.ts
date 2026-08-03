/*
===============================================================================

PBOS Execution Pipeline Contract

Authority

PBOS-CIP-007B-002

Classification

Compiler Pipeline Contract

===============================================================================
*/


export interface ExecutionCompilationRequest {


    readonly operatingSystemArtifactId: string;


}



export interface ExecutionCompilationResult {


    readonly executionArtifactId: string;


    readonly success: boolean;


    readonly createdAt: Date;


}
