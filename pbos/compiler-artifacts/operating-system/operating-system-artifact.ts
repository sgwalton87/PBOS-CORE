/*
===============================================================================

PBOS Operating System Artifact

Authority

PBOS-CIP-006B-001

Classification

Compiler Artifact

===============================================================================
*/

import {
    OperatingSystemModel
}
from "../../os-engine";


export interface OperatingSystemArtifact {


    readonly id: string;


    readonly artifactType:

        "OPERATING_SYSTEM";


    readonly schemaVersion: string;


    readonly compilerVersion: string;


    readonly producedBy: string;


    readonly producedAt: Date;


    readonly sessionId: string;


    readonly lineageId: string;


    readonly metadata: Record<string, unknown>;


    readonly operatingSystemModel:

        OperatingSystemModel;


}
