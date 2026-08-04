/*
===============================================================================

PBOS Governance Compilation Stage

Authority

PBOS-CIP-009B-003

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

    EvolutionArtifact,

    GovernanceArtifact

}

from "../../compiler-artifacts";



export class GovernanceCompilationStage

    implements PipelineStage {



    readonly id =

        "governance-compilation";



    readonly name =

        "Governance Compilation";



    readonly order = 8;



    async execute(

        context: CompilerContext

    ): Promise<void> {



        const evolution =

            context.findArtifact<EvolutionArtifact>(

                "EVOLUTION"

            );



        if (!evolution) {


            throw new Error(

                "EvolutionArtifact missing."

            );


        }



        const governanceModel =

            context.governanceRuntime.compile(

                evolution.evolutionModel.id

            );



        const artifact: GovernanceArtifact = {


            id:

                randomUUID(),


            artifactType:

                "GOVERNANCE",


            schemaVersion:

                "1.0.0",


            compilerVersion:

                "1.0.0",


            producedBy:

                "GovernanceCompilationStage",


            producedAt:

                new Date(),


            sessionId:

                evolution.sessionId,


            lineageId:

                randomUUID(),


            metadata: {

                source:

                    "governance-engine"

            },


            governanceModel

        };



        context.registerArtifact(

            artifact as any

        );


    }


}
