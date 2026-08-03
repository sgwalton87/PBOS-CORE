/*
===============================================================================

PBOS Discover Session

===============================================================================
*/

import { randomUUID } from "crypto";

import { DiscoveryExecutionMode }
from "../contracts/discover-command-contract";

export class DiscoverSession {

    readonly id = randomUUID();

    readonly startedAt = new Date();

    constructor(

        public readonly mode: DiscoveryExecutionMode

    ) {}

}
