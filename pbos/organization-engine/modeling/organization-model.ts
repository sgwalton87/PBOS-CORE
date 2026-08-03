/*
===============================================================================

PBOS Organization Model

Authority

PBOS-CIP-005A-005

Classification

Organizational Compiler Model

===============================================================================
*/


import {

    Capability

}

from "../contracts/capability";


import {

    OrganizationRole

}

from "../contracts/role";


import {

    Workflow

}

from "../contracts/workflow";



export interface OrganizationModel {


    readonly id: string;


    readonly name: string;


    readonly capabilities: readonly Capability[];


    readonly roles: readonly OrganizationRole[];


    readonly workflows: readonly Workflow[];


    readonly confidence: number;


    readonly createdAt: Date;


}
