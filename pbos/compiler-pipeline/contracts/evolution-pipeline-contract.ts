/*
===============================================================================

PBOS Evolution Pipeline Contract

Authority

PBOS-CIP-008B-002

Classification

Compiler Pipeline Contract

===============================================================================
*/


export interface EvolutionCompilationRequest {


    readonly executionArtifactId: string;


}



export interface EvolutionCompilationResult {


    readonly evolutionArtifactId: string;


    readonly success: boolean;


    readonly createdAt: Date;


}
