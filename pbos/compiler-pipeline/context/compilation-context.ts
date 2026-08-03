/*
===============================================================================

PBOS Compilation Context

Classification

Compiler Context

Authority

PBS-CMP

===============================================================================

Purpose

The Compilation Context represents the complete constitutional environment in
which compilation occurs.

The Context SHALL remain immutable throughout a compilation lifecycle.

===============================================================================
*/

export interface CompilationContext {

    readonly compilationId: string;

    readonly organizationId: string;

    readonly compilerVersion: string;

    readonly constitutionalAuthority: string;

    readonly organizationModel: string;

    readonly startedAt: Date;

}
