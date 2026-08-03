/*
===============================================================================

PBOS Execution Model

Authority

PBOS-CIP-007A-005

Classification

Execution Runtime Model

===============================================================================
*/


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



export interface ExecutionModel {


    readonly id: string;


    readonly name: string;


    readonly sourceOperatingSystemId: string;


    readonly state: ExecutionState;


    readonly actors: readonly RuntimeActor[];


    readonly workflows: readonly ExecutionWorkflow[];


    readonly createdAt: Date;


}
