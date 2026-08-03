/*
===============================================================================

PBOS Execution Report

Authority

PBOS-CIP-007A-013

Classification

Runtime Reporting

===============================================================================
*/


import {

    ExecutionModel

}

from "../modeling/execution-model";



export interface ExecutionReport {


    readonly id: string;


    readonly executionId: string;


    readonly actorCount: number;


    readonly workflowCount: number;


    readonly missionCount: number;


    readonly status: string;


    readonly generatedAt: Date;


}



export function createExecutionReport(

    model: ExecutionModel

): ExecutionReport {



    return {


        id:

            crypto.randomUUID(),


        executionId:

            model.id,


        actorCount:

            model.actors.length,


        workflowCount:

            model.workflows.length,


        missionCount:

            model.state.activeMissionIds.length,


        status:

            model.state.status,


        generatedAt:

            new Date()


    };


}
