/*
===============================================================================

PBOS Compiler Manifest

Classification

Compiler Pipeline

Authority

PBS-CMP

===============================================================================

Purpose

The Compiler Manifest declares the complete constitutional compilation plan
for a single compilation lifecycle.

The Manifest SHALL preserve execution ordering.

The Manifest SHALL preserve dependency relationships.

The Manifest SHALL preserve reproducibility.

===============================================================================
*/

export interface CompilerManifest {

    readonly compilationId: string;

    readonly stages: readonly string[];

    readonly dependencies: readonly string[];

    readonly compilerVersion: string;

    readonly constitutionalAuthority: string;

}
