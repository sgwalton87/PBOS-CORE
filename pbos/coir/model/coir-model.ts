/*
===============================================================================

PBOS Canonical Organization Model

Authority

PBOS-COIR-005

===============================================================================
*/

export interface CanonicalOrganization {

    readonly id: string;

    readonly legalName: string;

    readonly mission: string;

    readonly vision: string;

    readonly values: readonly string[];

    readonly capabilities: readonly string[];

    readonly organizationalUnits: readonly string[];

    readonly stakeholders: readonly string[];

    readonly governanceModel: string;

}
