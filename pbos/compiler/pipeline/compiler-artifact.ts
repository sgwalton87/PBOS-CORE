/*
===============================================================================

PBOS Compiler Artifact

Classification

Constitutional Artifact

Authority

PBS-CMP

===============================================================================

Purpose

A Compiler Artifact represents the immutable output produced by one
constitutional compilation stage.

Every artifact SHALL preserve:

• provenance

• constitutional authority

• compilation stage

• evidence lineage

• reproducibility

===============================================================================

Constitutional Law

Compiler Artifacts SHALL remain immutable.

Every artifact SHALL identify the stage that produced it.

Every artifact SHALL remain independently certifiable.

===============================================================================
*/

export interface CompilerArtifact {

    readonly artifactId: string;

    readonly producedBy: string;

    readonly compilationStage: string;

    readonly constitutionalAuthority: string;

    readonly evidence: readonly string[];

    readonly certified: boolean;

}
