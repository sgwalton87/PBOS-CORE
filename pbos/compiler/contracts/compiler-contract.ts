/*
===============================================================================

PBOS Constitutional Compiler Contract

===============================================================================
*/

export interface CompilerContract {

    readonly compilerId: string;

    readonly organizationId: string;

    readonly constitutionalAuthority: string;

    readonly preserveFounderIntent: boolean;

    readonly preserveEvidenceLineage: boolean;

    readonly deterministicCompilation: boolean;

    readonly certificationRequired: boolean;

}

export interface CompilerResult {

    readonly compilationSuccessful: boolean;

    readonly artifactsGenerated: readonly string[];

    readonly validationPassed: boolean;

    readonly certificationEligible: boolean;

}
