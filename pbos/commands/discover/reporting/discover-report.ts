/*
===============================================================================

PBOS Discovery Report

===============================================================================
*/

import { DiscoverSession }
from "../session/discover-session";

export interface DiscoverReport {

    readonly sessionId: string;

    readonly createdAt: Date;

    readonly status: "INITIALIZED";

}

export function createDiscoverReport(

    session: DiscoverSession

): DiscoverReport {

    return {

        sessionId: session.id,

        createdAt: new Date(),

        status: "INITIALIZED"

    };

}
