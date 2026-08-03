/*
===============================================================================

PBOS Compiler Session

Authority

PBOS-CIP-002B-004

===============================================================================
*/

import { randomUUID }

from "crypto";

export class CompilerSession {

    readonly sessionId =

        randomUUID();

    readonly startedAt =

        new Date();

    readonly compilerVersion =

        "1.0.0";

}
