/*
===============================================================================

PBOS Compiler Metrics

Classification

Compiler Kernel

Authority

PBS-CMP

===============================================================================

Purpose

Compiler Metrics provide constitutional observability into compilation.

Metrics SHALL support:

• execution performance

• constitutional integrity

• certification readiness

• operational diagnostics

Metrics SHALL NEVER influence constitutional authority.

===============================================================================
*/

export interface CompilerMetrics {

    readonly stagesExecuted: number;

    readonly artifactsGenerated: number;

    readonly validationFailures: number;

    readonly certificationFailures: number;

    readonly executionDurationMs: number;

}
