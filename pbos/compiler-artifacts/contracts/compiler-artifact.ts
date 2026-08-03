/*
===============================================================================

PBOS Compiler Artifact

Authority

PBOS-ARTIFACT-001

Classification

Constitutional Compiler Contract

===============================================================================

Purpose

Defines the base immutable artifact exchanged between every compiler stage.

All compiler artifacts SHALL inherit this contract.

===============================================================================
*/

export interface CompilerArtifact {

    readonly id: string;

    readonly artifactType: string;

    readonly schemaVersion: string;

    readonly compilerVersion: string;

    readonly producedBy: string;

    readonly producedAt: Date;

    readonly sessionId: string;

    readonly parentArtifactId?: string;

    readonly lineageId: string;

    readonly metadata: Readonly<Record<string, unknown>>;

}
