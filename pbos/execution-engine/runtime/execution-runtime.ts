/*
===============================================================================

PBOS Execution Runtime

Authority

PBOS-CIP-007A-010

Classification

Execution Runtime Compiler

===============================================================================
*/


import {

    ExecutionModel

}

from "../modeling/execution-model";


import {

    ExecutionBuilder

}

from "../modeling/execution-builder";


import {

    MissionRuntime

}

from "../missions/mission-runtime";


import {

    ActorRuntime

}

from "../roles/actor-runtime";


import {

    WorkflowRuntime

}

from "../workflows/workflow-runtime";


import {

    ExecutionState

}

from "../contracts/execution-state";



export class ExecutionRuntime {



    private readonly builder =

        new ExecutionBuilder();



    private readonly missionRuntime =

        new MissionRuntime();



    private readonly actorRuntime =

        new ActorRuntime();



    private readonly workflowRuntime =

        new WorkflowRuntime();




    compile(

        name: string,

        operatingSystemId: string

    ): ExecutionModel {



        const mission =

            this.missionRuntime.activate(

                "primary-mission"

            );



        const actor =

            this.actorRuntime.initialize(

                "system-role",

                []

            );



        const workflow =

            this.workflowRuntime.initialize(

                "primary-workflow",

                [

                    "initialize",

                    "execute",

                    "evaluate"

                ],

                [

                    actor.id

                ]

            );



        const state: ExecutionState = {


            id:

                crypto.randomUUID(),


            executionId:

                crypto.randomUUID(),


            status:

                "READY",


            activeMissionIds:

                [

                    mission.missionId

                ],


            activeWorkflowIds:

                [

                    workflow.id

                ],


            activeActorIds:

                [

                    actor.id

                ],


            updatedAt:

                new Date(),


            metadata: {}

        };



        return this.builder.build(

            name,

            operatingSystemId,

            state,

            [

                actor

            ],

            [

                workflow

            ]

        );


    }


}
