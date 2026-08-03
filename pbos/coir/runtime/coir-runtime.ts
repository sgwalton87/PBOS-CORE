/*
===============================================================================

PBOS COIR Runtime

Authority

PBOS-COIR-003

===============================================================================
*/

export enum CoirRuntimeState {

    INITIALIZING = "INITIALIZING",

    READY = "READY",

    COMPILING = "COMPILING",

    COMPLETED = "COMPLETED",

    FAILED = "FAILED"

}

export class CoirRuntime {

    private state =
        CoirRuntimeState.INITIALIZING;

    async initialize(): Promise<void> {

        this.state =
            CoirRuntimeState.READY;

    }

    begin(): void {

        this.state =
            CoirRuntimeState.COMPILING;

    }

    complete(): void {

        this.state =
            CoirRuntimeState.COMPLETED;

    }

    fail(): void {

        this.state =
            CoirRuntimeState.FAILED;

    }

    getState(): CoirRuntimeState {

        return this.state;

    }

}
