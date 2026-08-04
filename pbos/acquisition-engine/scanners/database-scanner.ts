/*
===============================================================================

PBOS Database Scanner

Authority

PBOS-CIP-010A-007

Classification

Data Architecture Scanner

===============================================================================
*/


export interface DatabaseDiscovery {


    readonly schemas:

        readonly string[];


    readonly tables:

        readonly string[];


    readonly migrations:

        readonly string[];


}



export class DatabaseScanner {



    scan(

        files: readonly string[]

    ): DatabaseDiscovery {



        return {


            schemas:

                files.filter(

                    file =>

                        file.includes(

                            "schema"

                        )

                ),


            tables:

                [],


            migrations:

                files.filter(

                    file =>

                        file.includes(

                            "migration"

                        )

                )


        };


    }


}
