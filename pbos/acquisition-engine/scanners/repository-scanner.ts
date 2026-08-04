/*
===============================================================================

PBOS Repository Scanner

Authority

PBOS-CIP-010A-004

Classification

Acquisition Scanner

===============================================================================
*/


import {

    RepositoryContext

}

from "../contracts/repository-context";



export class RepositoryScanner {



    scan(

        repositoryPath: string

    ): RepositoryContext {



        return {


            id:

                crypto.randomUUID(),


            repositoryName:

                repositoryPath

                    .split("/")

                    .filter(Boolean)

                    .pop()

                    ?? "unknown",


            repositoryPath,


            branch:

                "unknown",


            commitHash:

                "unknown",


            remote:

                undefined,


            detectedAt:

                new Date(),


            metadata: {


                scanner:

                    "RepositoryScanner"


            }


        };


    }


}
