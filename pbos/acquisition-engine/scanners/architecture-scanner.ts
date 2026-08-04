/*
===============================================================================

PBOS Architecture Scanner

Authority

PBOS-CIP-010A-005

Classification

System Understanding Scanner

===============================================================================
*/


export interface ArchitectureDiscovery {


    readonly applications:

        readonly string[];


    readonly modules:

        readonly string[];


    readonly domains:

        readonly string[];


    readonly frameworks:

        readonly string[];


}



export class ArchitectureScanner {



    scan(

        files: readonly string[]

    ): ArchitectureDiscovery {



        return {


            applications:

                [],


            modules:

                files,


            domains:

                [],


            frameworks:

                []


        };


    }


}
