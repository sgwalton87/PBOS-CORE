/*
===============================================================================

PBOS Execution Builder

Authority

PBOS-CIP-007A-006

Classification

Execution Runtime Compiler

===============================================================================
*/


import {

    ExecutionModel

}

from "./execution-model";


import {

    ExecutionState

}

from "../contracts/execution-state";


import {

    RuntimeActor

}

from "../contracts/runtime-actor";


import {

    ExecutionWorkflow

}

from "../contracts/execution-workflow";



export class ExecutionBuilder {



    build(

        name: string,

        operatingSystemId: string,

        state: ExecutionState,

        actors: readonly RuntimeActor[],

        workflows: readonly ExecutionWorkflow[]

    ): ExecutionModel {



        return {


            id:

                crypto.randomUUID(),


            name,


            sourceOperatingSystemId:

                operatingSystemId,


            state,


            actors,


            workflows,


            createdAt:

                new Date()


        };


    }


}
