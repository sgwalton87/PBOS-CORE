/*
===============================================================================

PBOS Stage Registry

Authority

PBOS-CIP-002

===============================================================================
*/

import { PipelineStage }

from "../stages/pipeline-stage";

export class StageRegistry {

    private readonly stages =

        new Map<string, PipelineStage>();

    register(

        stage: PipelineStage

    ): void {

        this.stages.set(

            stage.id,

            stage

        );

    }

    resolve(

        id: string

    ): PipelineStage | undefined {

        return this.stages.get(id);

    }

    getAll(): readonly PipelineStage[] {

        return [

            ...this.stages.values()

        ].sort(

            (a, b) =>

                a.order - b.order

        );

    }

}
