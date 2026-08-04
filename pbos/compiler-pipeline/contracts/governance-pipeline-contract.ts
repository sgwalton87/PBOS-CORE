/*
===============================================================================

PBOS Governance Pipeline Contract

Authority

PBOS-CIP-009B-002

Classification

Compiler Pipeline Contract

===============================================================================
*/


export interface GovernanceCompilationRequest {


    readonly evolutionArtifactId: string;


}



export interface GovernanceCompilationResult {


    readonly governanceArtifactId: string;


    readonly success: boolean;


    readonly createdAt: Date;


}
