/*
===============================================================================

PBOS Evolution Builder

Authority

PBOS-CIP-008A-006

Classification

Evolution Runtime Compiler

===============================================================================
*/


import {

    EvolutionModel

}

from "./evolution-model";


import {

    EvolutionState

}

from "../contracts/evolution-state";


import {

    ObservationContract

}

from "../contracts/observation-contract";


import {

    FeedbackContract

}

from "../contracts/feedback-contract";



export class EvolutionBuilder {



    build(

        executionId: string,

        observations: readonly ObservationContract[],

        feedback: readonly FeedbackContract[]

    ): EvolutionModel {



        const state: EvolutionState = {


            id:

                crypto.randomUUID(),


            evolutionId:

                crypto.randomUUID(),


            status:

                "EVALUATING",


            observationCount:

                observations.length,


            feedbackCount:

                feedback.length,


            updatedAt:

                new Date(),


            metadata: {}

        };



        return {


            id:

                crypto.randomUUID(),


            sourceExecutionId:

                executionId,


            observations,


            feedback,


            state,


            createdAt:

                new Date()


        };


    }


}
