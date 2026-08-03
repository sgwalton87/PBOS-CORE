/*
===============================================================================

PBOS Operating System Model

Authority

PBOS-CIP-006A-005

Classification

Operating System Compiler Model

===============================================================================
*/


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



export interface OperatingSystemModel {


    readonly id: string;


    readonly name: string;


    readonly sourceOrganizationId: string;


    readonly missions: readonly Mission[];


    readonly roles: readonly OperatingRole[];


    readonly workflows: readonly OperatingWorkflow[];


    readonly confidence: number;


    readonly createdAt: Date;


}
