/*
===============================================================================

PBOS Operating System Pipeline Contract

Authority

PBOS-CIP-006B-002

Classification

Compiler Pipeline Contract

===============================================================================
*/


export interface OperatingSystemCompilationRequest {


    readonly operatingSystemName: string;


    readonly organizationArtifactId: string;


}



export interface OperatingSystemCompilationResult {


    readonly operatingSystemArtifactId: string;


    readonly success: boolean;


    readonly createdAt: Date;


}
