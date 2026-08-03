/*
===============================================================================

PBOS Operating System Builder

Authority

PBOS-CIP-006A-006

Classification

Operating System Compiler

===============================================================================
*/


import {

    OperatingSystemModel

}

from "./operating-system-model";


import {

    Mission

}

from "../contracts/mission";


import {

    OperatingRole

}

from "../contracts/os-role";


import {

    OperatingWorkflow

}

from "../contracts/os-workflow";



export class OperatingSystemBuilder {



    build(

        name: string,

        organizationId: string,

        missions: readonly Mission[],

        roles: readonly OperatingRole[],

        workflows: readonly OperatingWorkflow[]

    ): OperatingSystemModel {


        const confidence =

            missions.length === 0

                ? 0

                : 1;



        return {


            id:

                crypto.randomUUID(),


            name,


            sourceOrganizationId:

                organizationId,


            missions,


            roles,


            workflows,


            confidence,


            createdAt:

                new Date()


        };

    }


}
