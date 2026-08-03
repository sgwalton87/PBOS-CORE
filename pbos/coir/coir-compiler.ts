/*
===============================================================================

PBOS COIR Compiler

Authority

PBOS-COIR-001

Classification

Constitutional Compiler

===============================================================================

Purpose

Compile the PBOS Intermediate Representation into the Canonical
Organizational Intermediate Representation.

The compiler SHALL orchestrate compilation only.

===============================================================================
*/

import { CoirRuntime } from "./runtime/coir-runtime";

export class CoirCompiler {

    constructor(

        private readonly runtime =
            new CoirRuntime()

    ) {}

    async initialize(): Promise<void> {

        await this.runtime.initialize();

    }

    async compile(): Promise<void> {

        console.log(

            "Compiling Canonical Organization..."

        );

    }

}
