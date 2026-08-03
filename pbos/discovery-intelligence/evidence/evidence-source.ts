/*
===============================================================================

PBOS Evidence Source

Authority

PBOS-DI-005

===============================================================================
*/

export interface EvidenceSource {

    readonly id: string;

    readonly name: string;

    readonly type:

        | "INTERVIEW"
        | "DOCUMENT"
        | "REPOSITORY"
        | "API"
        | "DATABASE"
        | "FILESYSTEM";

    readonly trusted: boolean;

}
