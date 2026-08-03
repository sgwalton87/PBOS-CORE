/*
===============================================================================

PBOS Compiler Stage

Classification

Compiler Pipeline

Authority

PBS-CMP

===============================================================================

Purpose

A Compiler Stage performs one deterministic constitutional transformation.

Stages SHALL remain independent.

Stages SHALL consume constitutional artifacts.

Stages SHALL produce constitutional artifacts.

===============================================================================
*/

export interface CompilerStage {

    readonly id: string;

    readonly name: string;

    readonly description: string;

    execute(): Promise<void>;

}
