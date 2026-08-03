/*
===============================================================================

PBOS Evolution Runtime

Authority

PBOS-CIP-008A-010

Classification

Evolution Runtime Compiler

===============================================================================
*/


import {

    EvolutionModel

}

from "../modeling/evolution-model";


import {

    EvolutionBuilder

}

from "../modeling/evolution-builder";


import {

    ObservationEngine

}

from "../observation/observation-engine";


import {

    FeedbackEngine

}

from "../feedback/feedback-engine";



export class EvolutionRuntime {


    private readonly builder =

        new EvolutionBuilder();



    private readonly observationEngine =

        new ObservationEngine();



    private readonly feedbackEngine =

        new FeedbackEngine();



    compile(

        executionId: string

    ): EvolutionModel {



        const observation =

            this.observationEngine.observe(

                executionId,

                "runtime-performance",

                "observed"

            );



        const feedback =

            this.feedbackEngine.create(

                executionId,

                "Execution evaluation completed.",

                1

            );



        return this.builder.build(

            executionId,

            [

                observation

            ],

            [

                feedback

            ]

        );


    }


}
