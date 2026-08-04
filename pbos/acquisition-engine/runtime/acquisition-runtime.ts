/*
===============================================================================

PBOS Acquisition Runtime

Authority

PBOS-CIP-010A-009

Classification

Acquisition Runtime

===============================================================================
*/


import {

    RepositoryScanner

}

from "../scanners/repository-scanner";


import {

    ArchitectureScanner

}

from "../scanners/architecture-scanner";


import {

    DependencyScanner

}

from "../scanners/dependency-scanner";


import {

    DatabaseScanner

}

from "../scanners/database-scanner";


import {

    DocumentationScanner

}

from "../scanners/documentation-scanner";



export class AcquisitionRuntime {



    private readonly repositoryScanner =

        new RepositoryScanner();



    private readonly architectureScanner =

        new ArchitectureScanner();



    private readonly dependencyScanner =

        new DependencyScanner();



    private readonly databaseScanner =

        new DatabaseScanner();



    private readonly documentationScanner =

        new DocumentationScanner();




    acquire(

        repositoryPath: string,

        files: readonly string[]

    ) {



        const repository =

            this.repositoryScanner.scan(

                repositoryPath

            );



        return {


            id:

                crypto.randomUUID(),


            artifactType:

                "SYSTEM",


            schemaVersion:

                "1.0.0",


            systemName:

                repository.repositoryName,


            repositoryPath,


            repositoryIdentity:

                repository.id,


            commitHash:

                repository.commitHash,


            architecture:

                this.architectureScanner.scan(

                    files

                ),


            dependencies:

                this.dependencyScanner.scan(

                    files

                ).dependencies,


            capabilities:

                [

                    ...this.documentationScanner.scan(

                        files

                    ).documents

                ],


            createdAt:

                new Date(),


            metadata: {


                database:

                    this.databaseScanner.scan(

                        files

                    )


            }


        };


    }


}
