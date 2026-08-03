/*
===============================================================================

PBOS Compiler State

Classification

Compiler Kernel

Authority

PBS-CMP

===============================================================================

Purpose

Represents the live constitutional execution state of a compiler.

The Compiler State SHALL be observable.

The Compiler State SHALL remain deterministic.

===============================================================================
*/

export interface CompilerState {

    readonly executionId: string;

    readonly lifecycle: string;

    readonly currentStage: string;

    readonly completedStages: readonly string[];

    readonly remainingStages: readonly string[];

    readonly progress: number;

}
