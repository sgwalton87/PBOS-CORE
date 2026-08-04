/*
===============================================================================

PBOS Genesis Acquisition Runtime

Authority

PBOS-CIP-010B-007

Classification

Genesis System Ingestion Runtime

===============================================================================
*/


import {

    PlaybookAcquisitionRuntime

}

    from "./playbook-acquisition-runtime";


import {

    SystemAcquisitionContext

}

    from "../contracts/system-acquisition-context";


import {

    SystemArtifact

}

    from "../contracts/system-artifact";



export class GenesisAcquisitionRuntime {



    private readonly playbookRuntime =

        new PlaybookAcquisitionRuntime();




    acquirePlaybook(): {

        artifact: SystemArtifact;

        context: SystemAcquisitionContext;

    } {



        const artifact =
            this.playbookRuntime.acquire();



        const context: SystemAcquisitionContext = {


            systemId:

                artifact.metadata.playbookSystemId as string,


            systemName:

                artifact.systemName,


            sourceRepository:

                artifact.repositoryPath,


            acquisitionMode:

                "READ_ONLY",


            acquiredAt:

                new Date(),


            metadata: {


                source:

                    "PlaybookAcquisitionRuntime"


            }


        };



        return {


            artifact,


            context


        };


    }


}
