/*
===============================================================================

PBOS Constitutional Discovery Contract

===============================================================================
*/

export interface DiscoveryContract {

    readonly organizationId: string;

    readonly founderId: string;

    readonly discoverySessionId: string;

    readonly mode:
        | "GREENFIELD"
        | "EXISTING_ORGANIZATION"
        | "EXISTING_PLATFORM"
        | "HYBRID";

    readonly constitutionalAuthority: string;

    readonly requiredConfidence: number;

    readonly certificationRequired: boolean;

}

export interface DiscoveryResult {

    organizationConstitution: boolean;

    organizationGenome: boolean;

    knowledgeGraph: boolean;

    discoveryPackage: boolean;

    certificationPackage: boolean;

    organizationalUnderstandingIndex: number;

    readyForEngineering: boolean;

}
