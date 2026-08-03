/*
===============================================================================

PBOS Compiler Engine

Classification

Compiler Kernel

Authority

PBS-CMP

===============================================================================

Purpose

A Compiler Engine performs one constitutional compilation.

Compiler Engines consume canonical organizational artifacts and produce
governed compiler artifacts.

Every engine SHALL be independently certifiable.

===============================================================================
*/

export interface CompilerEngine {

    readonly id: string;

    readonly name: string;

    readonly version: string;

    compile(): Promise<void>;

}
