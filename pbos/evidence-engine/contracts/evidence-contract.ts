/*
===============================================================================

PBOS Evidence Contract

Authority

PBOS-CIP-003A-001

Classification

Constitutional Contract

===============================================================================
*/

export type EvidenceType =

    | "DOCUMENT"

    | "INTERACTION"

    | "SYSTEM"

    | "EXTERNAL_SOURCE"

    | "USER_INPUT";


export type EvidenceStatus =

    | "COLLECTED"

    | "NORMALIZED"

    | "VALIDATED"

    | "REJECTED";


export interface EvidenceContract {

    readonly id: string;

    readonly evidenceType: EvidenceType;

    readonly status: EvidenceStatus;

    readonly source: string;

    readonly collectedAt: Date;

    readonly content: unknown;

    readonly confidence: number;

    readonly provenanceId: string;

    readonly lineageId: string;

}
