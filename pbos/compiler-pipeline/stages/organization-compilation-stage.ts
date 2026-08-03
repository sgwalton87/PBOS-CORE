/*
===============================================================================

PBOS Organization Compilation Stage

Authority

PBOS-CIP-005B-003

Classification

Compiler Pipeline Stage

===============================================================================
*/

import { randomUUID }
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
    KnowledgeGraphArtifact,
    OrganizationArtifact
}
from "../../compiler-artifacts";


export class OrganizationCompilationStage

    implements PipelineStage {


    readonly id = "organization-compilation";


    readonly name = "Organization Compilation";


    readonly order = 4;



    async execute(

        context: CompilerContext

    ): Promise<void> {



        const knowledgeGraph =

            context.findArtifact<KnowledgeGraphArtifact>(

                "KNOWLEDGE_GRAPH"

            );



        if (!knowledgeGraph) {


            throw new Error(

                "KnowledgeGraphArtifact missing."

            );


        }



        const organizationModel =

            context.organizationRuntime.compile(

                "Generated Organization",

                [

                    knowledgeGraph.id

                ]

            );



        const artifact: OrganizationArtifact = {


            id:

                randomUUID(),


            artifactType:

                "ORGANIZATION",


            schemaVersion:

                "1.0.0",


            compilerVersion:

                "1.0.0",


            producedBy:

                "OrganizationCompilationStage",


            producedAt:

                new Date(),


            sessionId:

                knowledgeGraph.sessionId,


            lineageId:

                randomUUID(),


            metadata: {

                source:

                    "organization-engine"

            },


            organizationModel

        };



        context.registerArtifact(

            artifact as any

        );


    }

}
