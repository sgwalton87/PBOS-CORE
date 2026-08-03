/*
===============================================================================

PBOS Execution State Manager

Authority

PBOS-CIP-007A-011

Classification

Runtime State Management

===============================================================================
*/


import {

    ExecutionState

}

from "../contracts/execution-state";



export class StateManager {



    update(

        state: ExecutionState,

        status: ExecutionState["status"]

    ): ExecutionState {



        return {


            ...state,


            status,


            updatedAt:

                new Date()


        };


    }


}
