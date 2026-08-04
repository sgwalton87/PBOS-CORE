/*
===============================================================================

PBOS Genesis System Catalog

Authority

PBOS-CIP-010B-014

Classification

Compilation Target Catalog

===============================================================================
*/


import {

    RegisteredSystem

}

from "../contracts/registered-system";



export class SystemCatalog {



    private readonly targets =

        new Map<string, RegisteredSystem>();




    add(

        system: RegisteredSystem

    ): void {


        this.targets.set(

            system.systemId,

            system

        );


    }




    find(

        systemId: string

    ):

        RegisteredSystem | undefined {


        return this.targets.get(

            systemId

        );


    }




    list():

        readonly RegisteredSystem[] {


        return [

            ...this.targets.values()

        ];


    }


}
