/*
===============================================================================

PBOS Playbook System Contract

Authority

PBOS-CIP-010B-001

Classification

Production Acquisition Contract

===============================================================================
*/


export interface PlaybookSystemContract {


    readonly systemId: string;


    readonly systemName: string;


    readonly repositoryName: string;


    readonly repositoryPath: string;


    readonly mission: string;


    readonly operatingDomains: readonly string[];


    readonly knownRoles: readonly string[];


    readonly knownCapabilities: readonly string[];


    readonly acquisitionVersion: string;


    readonly createdAt: Date;


}
