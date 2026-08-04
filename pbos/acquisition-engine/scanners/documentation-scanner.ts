/*
===============================================================================

PBOS Documentation Scanner

Authority

PBOS-CIP-010A-008

Classification

Knowledge Acquisition Scanner

===============================================================================
*/


export interface DocumentationDiscovery {


    readonly documents:

        readonly string[];


    readonly sections:

        readonly string[];


    readonly discoveredAt:

        Date;


}



export class DocumentationScanner {



    scan(

        files: readonly string[]

    ): DocumentationDiscovery {



        return {


            documents:

                files.filter(

                    file =>

                        file.endsWith(

                            ".md"

                        )

                ),


            sections:

                [],


            discoveredAt:

                new Date()


        };


    }


}
