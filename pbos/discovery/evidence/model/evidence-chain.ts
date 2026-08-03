/*
===============================================================================

PBOS Constitutional Evidence Chain

===============================================================================

Purpose

Every constitutional conclusion SHALL be explainable.

Evidence Chains preserve the complete reasoning lineage that produced a
constitutional artifact.

===============================================================================
*/

export interface EvidenceChain {

    readonly conclusion: string;

    readonly evidence: readonly string[];

    readonly confidence: number;

}
