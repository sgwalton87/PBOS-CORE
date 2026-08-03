/*
===============================================================================

PBOS Evidence Record Contract

Authority

PBOS-CIP-003A-003

===============================================================================
*/

import {
    EvidenceSource
}
from "./evidence-source";

import {
    EvidenceStatus,
    EvidenceType
}
from "./evidence-contract";


export interface EvidenceRecord {

    readonly id: string;

    readonly type: EvidenceType;

    readonly status: EvidenceStatus;

    readonly source: EvidenceSource;

    readonly payload: unknown;

    readonly collectedAt: Date;

    readonly normalizedAt?: Date;

    readonly validatedAt?: Date;

    readonly confidence: number;

    readonly metadata: Record<string, unknown>;

}
