/*
===============================================================================

PBOS Stage Lifecycle

Authority

PBOS-CIP-002B-003

===============================================================================
*/

export enum StageLifecycleState {

    INITIALIZED = "INITIALIZED",

    VALIDATED = "VALIDATED",

    EXECUTING = "EXECUTING",

    COMPLETED = "COMPLETED",

    FAILED = "FAILED"

}

export class StageLifecycle {

    private state =

        StageLifecycleState.INITIALIZED;

    transition(

        state: StageLifecycleState

    ): void {

        this.state = state;

    }

    current(): StageLifecycleState {

        return this.state;

    }

}
