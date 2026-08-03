/*
===============================================================================

PBOS Constitutional Evidence

Classification

Constitutional Evidence

===============================================================================

Purpose

Evidence represents a verified organizational fact.

PBOS SHALL never reason from unsupported assertions.

Every organizational fact SHALL reference constitutional evidence.

===============================================================================
*/

export interface ConstitutionalEvidence {

    readonly id: string;

    readonly source: string;

    readonly classification: string;

    readonly timestamp: Date;

    readonly confidence: number;

    readonly immutable: boolean;

}
