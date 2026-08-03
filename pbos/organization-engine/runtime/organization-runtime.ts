/*
===============================================================================

PBOS Organization Runtime

Authority

PBOS-CIP-005A-010

Classification

Organizational Compiler Runtime

===============================================================================
*/

import {

    OrganizationModel

}

from "../modeling/organization-model";


import {

    CapabilityEngine

}

from "../capabilities/capability-engine";


import {

    RoleEngine

}

from "../roles/role-engine";


import {

    WorkflowEngine

}

from "../workflows/workflow-engine";


import {

    OrganizationModelBuilder

}

from "../modeling/model-builder";



export class OrganizationRuntime {


    private readonly capabilityEngine =
        new CapabilityEngine();


    private readonly roleEngine =
        new RoleEngine();


    private readonly workflowEngine =
        new WorkflowEngine();


    private readonly modelBuilder =
        new OrganizationModelBuilder();



    compile(

        name: string,

        knowledgeIds: readonly string[]

    ): OrganizationModel {


        const capabilities =

            this.capabilityEngine.compile(

                knowledgeIds

            );



        const roles =

            this.roleEngine.compile(

                capabilities.map(

                    capability => capability.id

                )

            );



        const workflows =

            this.workflowEngine.compile(

                roles.map(

                    role => role.id

                )

            );



        return this.modelBuilder.build(

            name,

            capabilities,

            roles,

            workflows

        );

    }


}
