/*
===============================================================================

PBOS Discovery Runtime

Authority

PBS-DSC-RT-001

Classification

Constitutional Runtime

===============================================================================
*/

import { DiscoverSession }
from "../session/discover-session";

import { RuntimeState }
from "../../../cli/runtime/runtime-state";

export class DiscoverRuntime {

    private state =
        RuntimeState.INITIALIZING;

    async initialize(
        session: DiscoverSession
    ): Promise<void> {

        console.log(
            `Session: ${session.id}`
        );

        this.state =
            RuntimeState.READY;

        console.log(
            "Discovery Runtime Ready."
        );

    }

    getState(): RuntimeState {

        return this.state;

    }

}
