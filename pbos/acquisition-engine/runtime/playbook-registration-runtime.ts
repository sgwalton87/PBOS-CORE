/*
===============================================================================

PBOS Playbook Registration Runtime

Authority

PBOS-CIP-010B-010

Classification

Genesis Artifact Registration Runtime

===============================================================================
*/


import {

    PlaybookGenesisAdapter

}

from "../adapters/playbook-genesis-adapter";


import {

    PlaybookCompilationTarget

}

from "../contracts/playbook-compilation-target";



export class PlaybookRegistrationRuntime {



    private readonly adapter =

        new PlaybookGenesisAdapter();




    register():

        PlaybookCompilationTarget {



        const result =

            this.adapter.compileTarget();



        return {


            targetId:

                crypto.randomUUID(),


            systemArtifact:

                result.artifact,


            compilationReady:

                true,


            createdAt:

                new Date(),


            metadata: {


                source:

                    "PlaybookGenesisAdapter",


                systemId:

                    result.context.systemId


            }


        };


    }


}
