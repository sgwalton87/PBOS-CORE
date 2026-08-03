/*
===============================================================================

PBOS Workflow Runtime

Authority

PBOS-CIP-007A-009

Classification

Execution Runtime

===============================================================================
*/


import {

    ExecutionWorkflow

}

from "../contracts/execution-workflow";



export class WorkflowRuntime {



    initialize(

        workflowId: string,

        steps: readonly string[],

        actorIds: readonly string[]

    ): ExecutionWorkflow {



        return {


            id:

                crypto.randomUUID(),


            name:

                "Runtime Workflow",


            sourceWorkflowId:

                workflowId,


            steps,


            assignedActorIds:

                actorIds,


            status:

                "READY",


            metadata:

                {

                    generatedBy:

                        "WorkflowRuntime"

                }


        };


    }


}
