/*
===============================================================================

PBOS Organization Pipeline Contract

Authority

PBOS-CIP-005B-002

Classification

Compiler Pipeline Contract

===============================================================================
*/


export interface OrganizationCompilationRequest {


    readonly organizationName: string;


    readonly knowledgeArtifactId: string;


}


export interface OrganizationCompilationResult {


    readonly organizationArtifactId: string;


    readonly success: boolean;


    readonly createdAt: Date;


}
