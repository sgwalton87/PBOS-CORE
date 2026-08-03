/*
===============================================================================

PBOS Organization Modeling Contract

Classification

Constitutional Contract

Authority

PBS-ORG

===============================================================================

Purpose

Govern construction of the canonical Organization Model.

The Organization Contract establishes the constitutional boundary between
organizational understanding and organizational representation.

===============================================================================
*/

export interface OrganizationContract {

    readonly organizationId: string;

    readonly constitutionalAuthority: string;

    readonly evidenceRequired: boolean;

    readonly preserveTraceability: boolean;

    readonly preserveFounderIntent: boolean;

    readonly certificationRequired: boolean;

}

export interface OrganizationModelResult {

    readonly canonicalModelGenerated: boolean;

    readonly evidenceVerified: boolean;

    readonly organizationCertified: boolean;

}
