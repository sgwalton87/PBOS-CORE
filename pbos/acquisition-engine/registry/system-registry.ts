/*
===============================================================================

PBOS System Registry

Authority

PBOS-CIP-010B-012

Classification

Genesis System Registry

===============================================================================
*/


import {

    RegisteredSystem

}

from "../contracts/registered-system";



export class SystemRegistry {


    private readonly systems =

        new Map<string, RegisteredSystem>();




    register(

        system: RegisteredSystem

    ): void {


        this.systems.set(

            system.systemId,

            system

        );


    }



    get(

        systemId: string

    ):

        RegisteredSystem | undefined {


        return this.systems.get(

            systemId

        );


    }



    all():

        readonly RegisteredSystem[] {


        return [

            ...this.systems.values()

        ];


    }


}
