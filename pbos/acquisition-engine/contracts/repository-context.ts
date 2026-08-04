/*
===============================================================================

PBOS Repository Context Contract

Authority

PBOS-CIP-010A-002

Classification

Acquisition Identity Contract

===============================================================================
*/


export interface RepositoryContext {


    readonly id: string;


    readonly repositoryName: string;


    readonly repositoryPath: string;


    readonly branch: string;


    readonly commitHash: string;


    readonly remote?: string;


    readonly detectedAt: Date;


    readonly metadata:

        Record<string, unknown>;


}
