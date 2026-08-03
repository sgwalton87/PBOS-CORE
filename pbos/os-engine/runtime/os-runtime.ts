/*
===============================================================================

PBOS Operating System Runtime

Authority

PBOS-CIP-006A-010

Classification

Operating System Compiler Runtime

===============================================================================
*/


import {

    OperatingSystemModel

}

from "../modeling/operating-system-model";


import {

    OperatingSystemBuilder

}

from "../modeling/os-builder";


import {

    MissionEngine

}

from "../mission/mission-engine";


import {

    OperatingRoleEngine

}

from "../roles/os-role-engine";


import {

    OperatingWorkflowEngine

}

from "../workflows/os-workflow-engine";



export class OperatingSystemRuntime {



    private readonly missionEngine =

        new MissionEngine();



    private readonly roleEngine =

        new OperatingRoleEngine();



    private readonly workflowEngine =

        new OperatingWorkflowEngine();



    private readonly builder =

        new OperatingSystemBuilder();




    compile(

        name: string,

        organizationId: string,

        capabilityIds: readonly string[]

    ): OperatingSystemModel {



        const missions =

            this.missionEngine.compile(

                `Operate ${name}`

            );



        const roles =

            this.roleEngine.compile(

                capabilityIds

            );



        const workflows =

            this.workflowEngine.compile(

                roles.map(

                    role => role.id

                )

            );



        return this.builder.build(

            name,

            organizationId,

            missions,

            roles,

            workflows

        );


    }


}
