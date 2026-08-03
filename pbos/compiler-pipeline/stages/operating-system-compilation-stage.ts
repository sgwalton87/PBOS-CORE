/*
===============================================================================

PBOS Operating System Compilation Stage

Authority

PBOS-CIP-006B-003

Classification

Compiler Pipeline Stage

===============================================================================
*/

import {
    randomUUID
}
from "crypto";


import {
    CompilerContext
}
from "../context/compiler-context";


import {
    PipelineStage
}
from "./pipeline-stage";


import {
    OrganizationArtifact,
    OperatingSystemArtifact
}
from "../../compiler-artifacts";



export class OperatingSystemCompilationStage

    implements PipelineStage {


    readonly id =

        "operating-system-compilation";


    readonly name =

        "Operating System Compilation";


    readonly order = 5;



    async execute(

        context: CompilerContext

    ): Promise<void> {



        const organization =

            context.findArtifact<OrganizationArtifact>(

                "ORGANIZATION"

            );



        if (!organization) {


            throw new Error(

                "OrganizationArtifact missing."

            );


        }



        const operatingSystem =

            context.organizationRuntime;



        const model =

            context.operatingSystemRuntime.compile(

                "Generated Operating System",

                organization.organizationModel.id,

                []

            );



        const artifact: OperatingSystemArtifact = {


            id:

                randomUUID(),


            artifactType:

                "OPERATING_SYSTEM",


            schemaVersion:

                "1.0.0",


            compilerVersion:

                "1.0.0",


            producedBy:

                "OperatingSystemCompilationStage",


            producedAt:

                new Date(),


            sessionId:

                organization.sessionId,


            lineageId:

                randomUUID(),


            metadata: {

                source:

                    "os-engine"

            },


            operatingSystemModel:

                model


        };



        context.registerArtifact(

            artifact as any

        );


    }

}
