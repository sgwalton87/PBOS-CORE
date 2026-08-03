/*
===============================================================================

PBOS Organization Artifact

Authority

PBOS-CIP-005B-001

Classification

Compiler Artifact

===============================================================================
*/

import {
    OrganizationModel
}
from "../../organization-engine";


export interface OrganizationArtifact {


    readonly id: string;


    readonly artifactType:

        "ORGANIZATION";


    readonly schemaVersion: string;


    readonly compilerVersion: string;


    readonly producedBy: string;


    readonly producedAt: Date;


    readonly sessionId: string;


    readonly lineageId: string;


    readonly metadata: Record<string, unknown>;


    readonly organizationModel:

        OrganizationModel;


}
