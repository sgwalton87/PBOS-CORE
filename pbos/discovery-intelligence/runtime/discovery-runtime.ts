/*
===============================================================================

PBOS Discovery Intelligence Runtime

Authority

PBOS-DI-003

===============================================================================
*/

export enum DiscoveryRuntimeState {

    INITIALIZING = "INITIALIZING",

    READY = "READY",

    EXECUTING = "EXECUTING",

    COMPLETED = "COMPLETED",

    FAILED = "FAILED"

}

export class DiscoveryRuntime {

    private state =
        DiscoveryRuntimeState.INITIALIZING;

    async initialize(): Promise<void> {

        this.state =
            DiscoveryRuntimeState.READY;

    }

    getState(): DiscoveryRuntimeState {

        return this.state;

    }

}
