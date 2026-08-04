/*
===============================================================================

PBOS Playbook Genesis Catalog

Authority

PBOS-CIP-010B-015

Classification

Initial Production Target Catalog

===============================================================================
*/


import {

    SystemCatalog

}

from "./system-catalog";


import {

    PlaybookTarget

}

from "../targets/playbook-target";



export class PlaybookCatalog {



    register(

        catalog: SystemCatalog

    ): void {



        const playbook =

            new PlaybookTarget();



        catalog.add(

            playbook.create()

        );


    }


}
