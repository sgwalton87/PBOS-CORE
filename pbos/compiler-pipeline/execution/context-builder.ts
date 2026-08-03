/*
===============================================================================

PBOS Compiler Context Builder

Authority

PBOS-CIP-002B-002

===============================================================================
*/

import { CompilerContext }
from "../context/compiler-context";

export class ContextBuilder {

    build(): CompilerContext {

        return new CompilerContext();

    }

}
