/*
===============================================================================

PBOS Evidence Provenance

Classification

Evidence Model

Authority

PBS-DSC

===============================================================================

Purpose

Evidence Provenance records the origin, acquisition method, timestamp,
and constitutional authority of every evidence artifact.

Every piece of evidence SHALL remain traceable throughout the
constitutional engineering lifecycle.

===============================================================================
*/

export interface EvidenceProvenance {

    readonly source: string;

    readonly acquisitionMethod: string;

    readonly authority: string;

    readonly collectedAt: Date;

    readonly collectedBy: string;

    readonly checksum?: string;

}
