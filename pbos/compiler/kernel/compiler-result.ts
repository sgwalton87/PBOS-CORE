/*
===============================================================================

PBOS Compiler Result

Classification

Compiler Kernel

Authority

PBS-CMP

===============================================================================

Purpose

Represents the immutable constitutional outcome of a compiler execution.

Compiler Results SHALL preserve:

• execution identity

• compiler identity

• constitutional authority

• produced artifacts

• certification status

===============================================================================
*/

export interface CompilerResult {

    readonly executionId: string;

    readonly compilerId: string;

    readonly organizationId: string;

    readonly artifacts: readonly string[];

    readonly validated: boolean;

    readonly certified: boolean;

}
