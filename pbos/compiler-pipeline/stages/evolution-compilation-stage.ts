/*
===============================================================================

PBOS Evolution Compilation Stage

Authority

PBOS-CIP-008B-003

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

    ExecutionArtifact,

    EvolutionArtifact

}

from "../../compiler-artifacts";



export class EvolutionCompilationStage

    implements PipelineStage {



    readonly id =

        "evolution-compilation";


    readonly name =

        "Evolution Compilation";


    readonly order = 7;



    async execute(

        context: CompilerContext

    ): Promise<void> {



        const execution =

            context.findArtifact<ExecutionArtifact>(

                "EXECUTION"

            );



        if (!execution) {


            throw new Error(

                "ExecutionArtifact missing."

            );


        }



        const evolutionModel =

            context.evolutionRuntime.compile(

                execution.executionModel.id

            );



        const artifact: EvolutionArtifact = {


            id:

                randomUUID(),


            artifactType:

                "EVOLUTION",


            schemaVersion:

                "1.0.0",


            compilerVersion:

                "1.0.0",


            producedBy:

                "EvolutionCompilationStage",


            producedAt:

                new Date(),


            sessionId:

                execution.sessionId,


            lineageId:

                randomUUID(),


            metadata: {

                source:

                    "evolution-engine"

            },


            evolutionModel

        };



        context.registerArtifact(

            artifact as any

        );


    }


}
