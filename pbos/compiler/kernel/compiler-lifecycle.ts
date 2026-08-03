/*
===============================================================================

PBOS Constitutional Compiler Lifecycle

Classification

Compiler Kernel

Authority

PBS-CMP

===============================================================================

Purpose

The Compiler Lifecycle governs every Constitutional Compilation executed by
PBOS Genesis.

Every compilation SHALL progress through the same deterministic lifecycle.

===============================================================================

Lifecycle

Initialized

↓

Authorized

↓

Prepared

↓

Executing

↓

Validated

↓

Certified

↓

Completed

===============================================================================

Constitutional Law

Compilers SHALL NOT skip lifecycle stages.

Every lifecycle transition SHALL preserve constitutional lineage.

===============================================================================
*/

export type CompilerLifecycleState =

    | "INITIALIZED"

    | "AUTHORIZED"

    | "PREPARED"

    | "EXECUTING"

    | "VALIDATED"

    | "CERTIFIED"

    | "COMPLETED";

export interface CompilerLifecycle {

    readonly state: CompilerLifecycleState;

    readonly enteredAt: Date;

}
