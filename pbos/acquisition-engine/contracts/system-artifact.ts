/*
===============================================================================

PBOS System Artifact

Authority

PBOS-CIP-010A-001

Classification

Acquisition Compiler Artifact

===============================================================================
*/


import {

    ArchitectureDiscovery

}

from "../scanners/architecture-scanner";


export interface SystemArtifact {


    readonly id: string;


    readonly artifactType:

        "SYSTEM";


    readonly schemaVersion: string;


    readonly systemName: string;


    readonly repositoryPath: string;


    readonly repositoryIdentity: string;


    readonly commitHash: string;


    readonly architecture: ArchitectureDiscovery;


    readonly dependencies: readonly string[];


    readonly capabilities: readonly string[];


    readonly createdAt: Date;


    readonly metadata: Record<string, unknown>;


}
