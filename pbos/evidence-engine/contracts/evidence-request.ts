/*
===============================================================================

PBOS Evidence Request Contract

Authority

PBOS-CIP-003A-004

===============================================================================
*/

import {
    EvidenceType
}
from "./evidence-contract";


export interface EvidenceRequest {

    readonly id: string;

    readonly requestedBy: string;

    readonly purpose: string;

    readonly evidenceTypes: readonly EvidenceType[];

    readonly criteria: Record<string, unknown>;

    readonly createdAt: Date;

    readonly priority: "LOW" | "MEDIUM" | "HIGH";

}
