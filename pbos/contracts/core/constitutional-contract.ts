/*
===============================================================================

PBOS Constitutional Contract

Authority

PCCS-000

===============================================================================
*/

export interface ConstitutionalContract {

    readonly id: string;

    readonly name: string;

    readonly version: string;

    readonly authority: string;

    readonly classification: string;

    readonly deterministic: boolean;

    readonly failClosed: boolean;

    readonly certifiable: boolean;

    readonly observable: boolean;

    readonly auditable: boolean;

    readonly producesEvidence: boolean;

    readonly producesArtifacts: boolean;

    readonly runtimeSafe: boolean;

}
