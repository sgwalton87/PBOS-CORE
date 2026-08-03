/*
===============================================================================

PBOS PIR Runtime

Authority

PBOS-PIR-003

===============================================================================
*/

export enum PirRuntimeState {

    INITIALIZING = "INITIALIZING",

    READY = "READY",

    EXECUTING = "EXECUTING",

    COMPLETED = "COMPLETED",

    FAILED = "FAILED"

}

export class PirRuntime {

    private state =
        PirRuntimeState.INITIALIZING;

    async initialize(): Promise<void> {

        this.state =
            PirRuntimeState.READY;

    }

    begin(): void {

        this.state =
            PirRuntimeState.EXECUTING;

    }

    complete(): void {

        this.state =
            PirRuntimeState.COMPLETED;

    }

    fail(): void {

        this.state =
            PirRuntimeState.FAILED;

    }

    getState(): PirRuntimeState {

        return this.state;

    }

}
