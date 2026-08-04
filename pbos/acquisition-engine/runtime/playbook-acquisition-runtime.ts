/*
===============================================================================

PBOS Playbook Acquisition Runtime

Authority

PBOS-CIP-010B-004

Classification

Production Acquisition Runtime

===============================================================================
*/


import {

    PlaybookAdapter

}

from "../adapters/playbook-adapter";


import {

    AcquisitionRuntime

}

from "./acquisition-runtime";


import {

    SystemArtifact

}

from "../contracts/system-artifact";



export class PlaybookAcquisitionRuntime {



    private readonly adapter =

        new PlaybookAdapter();



    private readonly acquisition =

        new AcquisitionRuntime();





    acquire():

        SystemArtifact {



        const profile =

            this.adapter.acquireProfile();



        const files =

            this.adapter.discoverFiles();



        const artifact =

            this.acquisition.acquire(

                profile.repositoryPath,

                files

            );



        return {


            ...artifact,


            artifactType:

                "SYSTEM",


            metadata: {


                ...artifact.metadata,


                playbookSystemId:

                    profile.systemId,


                mission:

                    profile.mission,


                domains:

                    profile.operatingDomains


            }


        };


    }


}
