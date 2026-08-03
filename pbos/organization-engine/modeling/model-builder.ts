/*
===============================================================================

PBOS Organization Model Builder

Authority

PBOS-CIP-005A-006

Classification

Organizational Compiler

===============================================================================
*/

import {

    OrganizationModel

}

from "./organization-model";


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



export class OrganizationModelBuilder {


    build(

        name: string,

        capabilities: readonly Capability[],

        roles: readonly OrganizationRole[],

        workflows: readonly Workflow[]

    ): OrganizationModel {


        const confidence =

            capabilities.length === 0

                ? 0

                : capabilities.reduce(

                    (total, capability) =>

                        total + capability.confidence,

                    0

                ) / capabilities.length;



        return {


            id:

                crypto.randomUUID(),


            name,


            capabilities,


            roles,


            workflows,


            confidence,


            createdAt:

                new Date()

        };

    }


}
