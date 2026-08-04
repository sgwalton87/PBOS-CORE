/*
===============================================================================

PBOS Playbook Compilation Target

Authority

PBOS-CIP-010B-013

Classification

Genesis Target Definition

===============================================================================
*/


import {

    PlaybookRegistrationRuntime

}

from "../runtime/playbook-registration-runtime";


import {

    RegisteredSystem

}

from "../contracts/registered-system";



export class PlaybookTarget {



    private readonly runtime =

        new PlaybookRegistrationRuntime();




    create():

        RegisteredSystem {



        const target =

            this.runtime.register();



        return {


            id:

                crypto.randomUUID(),


            systemId:

                target.metadata.systemId as string,


            systemName:

                "Playbook Platform",


            artifact:

                target.systemArtifact,


            lifecycleState:

                "REGISTERED",


            registeredAt:

                new Date(),


            metadata: {


                source:

                    "PlaybookTarget"


            }


        };


    }


}
