/*
===============================================================================

PBOS Boot Context

Authority

PBOS-BOOT-002

===============================================================================
*/

import { randomUUID } from "crypto";

export class BootContext {

    readonly id = randomUUID();

    readonly startedAt = new Date();

    readonly version = "1.0.0";

    readonly runtime = "PBOS Genesis";

    readonly status = "INITIALIZED";

}
