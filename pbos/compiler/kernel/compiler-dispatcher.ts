/*
===============================================================================

PBOS Compiler Dispatcher

Classification

Compiler Kernel

Authority

PBS-CMP

===============================================================================

Purpose

The Compiler Dispatcher selects the appropriate Constitutional Compiler based
upon the requested compilation objective.

The Dispatcher SHALL dispatch.

The Compiler SHALL compile.

===============================================================================

Constitutional Law

Dispatch SHALL remain deterministic.

Compiler selection SHALL remain explainable.

===============================================================================
*/

export class CompilerDispatcher {

    async dispatch() {

        throw new Error(
            "Compiler Dispatcher not implemented."
        );

    }

}
