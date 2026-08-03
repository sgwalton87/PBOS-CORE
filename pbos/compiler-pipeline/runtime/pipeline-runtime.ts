/*
===============================================================================

PBOS Compiler Pipeline Runtime

Authority

PBOS-PIPELINE-003

===============================================================================
*/

export enum PipelineRuntimeState {

    INITIALIZING = "INITIALIZING",

    READY = "READY",

    EXECUTING = "EXECUTING",

    COMPLETED = "COMPLETED",

    FAILED = "FAILED"

}

export class PipelineRuntime {

    private state =
        PipelineRuntimeState.INITIALIZING;

    private readonly metrics = {

        startedAt: new Date(),

        completedAt: undefined as Date | undefined

    };

    async initialize(): Promise<void> {

        this.state =
            PipelineRuntimeState.READY;

    }

    begin(): void {

        this.state =
            PipelineRuntimeState.EXECUTING;

        this.metrics.startedAt =
            new Date();

    }

    complete(): void {

        this.state =
            PipelineRuntimeState.COMPLETED;

        this.metrics.completedAt =
            new Date();

    }

    fail(): void {

        this.state =
            PipelineRuntimeState.FAILED;

    }

    getState(): PipelineRuntimeState {

        return this.state;

    }

    getMetrics() {

        return this.metrics;

    }

}
