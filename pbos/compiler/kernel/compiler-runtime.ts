/*
===============================================================================

PBOS Compiler Runtime

Classification

Compiler Runtime

Authority

PBS-CMP

===============================================================================

Purpose

The Compiler Runtime maintains the constitutional execution environment for
all compiler operations.

The Runtime SHALL preserve:

• execution context

• deterministic ordering

• compiler isolation

• artifact lineage

• execution integrity

===============================================================================
*/

export interface CompilerRuntime {

    readonly runtimeId: string;

    readonly compilerVersion: string;

    readonly executionId: string;

    readonly startedAt: Date;

}
