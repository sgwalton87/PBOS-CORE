/*
===============================================================================

PBOS Actor Runtime

Authority

PBOS-CIP-007A-008

Classification

Execution Runtime

===============================================================================
*/


import {

    RuntimeActor

}

from "../contracts/runtime-actor";



export class ActorRuntime {



    initialize(

        roleId: string,

        capabilityIds: readonly string[]

    ): RuntimeActor {



        return {


            id:

                crypto.randomUUID(),


            name:

                "Runtime Actor",


            roleId,


            capabilityIds,


            status:

                "AVAILABLE",


            metadata:

                {

                    generatedBy:

                        "ActorRuntime"

                }


        };


    }


}
