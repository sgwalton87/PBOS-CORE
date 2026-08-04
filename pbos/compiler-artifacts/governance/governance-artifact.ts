/*
===============================================================================

PBOS Governance Artifact

Authority

PBOS-CIP-009B-001

Classification

Compiler Artifact

===============================================================================
*/


import {

    GovernanceModel

}

from "../../governance-engine";



export interface GovernanceArtifact {


    readonly id: string;


    readonly artifactType:

        "GOVERNANCE";


    readonly schemaVersion: string;


    readonly compilerVersion: string;


    readonly producedBy: string;


    readonly producedAt: Date;


    readonly sessionId: string;


    readonly lineageId: string;


    readonly metadata: Record<string, unknown>;


    readonly governanceModel:

        GovernanceModel;


}
