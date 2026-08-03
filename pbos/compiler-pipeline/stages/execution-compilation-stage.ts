/*
===============================================================================

PBOS Execution Compilation Stage

Authority

PBOS-CIP-007B-003

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

    OperatingSystemArtifact,

    ExecutionArtifact

}

from "../../compiler-artifacts";



export class ExecutionCompilationStage

    implements PipelineStage {



    readonly id =

        "execution-compilation";



    readonly name =

        "Execution Compilation";



    readonly order = 6;




    async execute(

        context: CompilerContext

    ): Promise<void> {



        const operatingSystem =

            context.findArtifact<OperatingSystemArtifact>(

                "OPERATING_SYSTEM"

            );



        if (!operatingSystem) {


            throw new Error(

                "OperatingSystemArtifact missing."

            );


        }



        const executionModel =

            context.executionRuntime.compile(

                "Generated Execution Runtime",

                operatingSystem.operatingSystemModel.id

            );



        const artifact: ExecutionArtifact = {


            id:

                randomUUID(),


            artifactType:

                "EXECUTION",


            schemaVersion:

                "1.0.0",


            compilerVersion:

                "1.0.0",


            producedBy:

                "ExecutionCompilationStage",


            producedAt:

                new Date(),


            sessionId:

                operatingSystem.sessionId,


            lineageId:

                randomUUID(),


            metadata: {

                source:

                    "execution-engine"

            },


            executionModel

        };



        context.registerArtifact(

            artifact as any

        );


    }


}
