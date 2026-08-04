/*
===============================================================================

PBOS Dependency Scanner

Authority

PBOS-CIP-010A-006

Classification

Acquisition Intelligence Scanner

===============================================================================
*/


export interface DependencyDiscovery {


    readonly dependencies:

        readonly string[];


    readonly packageManagers:

        readonly string[];


    readonly runtime:

        readonly string[];


}



export class DependencyScanner {



    scan(

        files: readonly string[]

    ): DependencyDiscovery {



        const packageFiles =

            files.filter(

                file =>

                    file.includes(

                        "package.json"

                    )

            );



        return {


            dependencies:

                packageFiles,


            packageManagers:

                [

                    "npm"

                ],


            runtime:

                [

                    "node"

                ]


        };


    }


}
