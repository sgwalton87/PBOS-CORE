/*
===============================================================================

PBOS Evolution Model

Authority

PBOS-CIP-008A-005

Classification

Evolution Runtime Model

===============================================================================
*/


import {

    ObservationContract

}

from "../contracts/observation-contract";


import {

    FeedbackContract

}

from "../contracts/feedback-contract";


import {

    EvolutionState

}

from "../contracts/evolution-state";



export interface EvolutionModel {


    readonly id: string;


    readonly sourceExecutionId: string;


    readonly observations:

        readonly ObservationContract[];


    readonly feedback:

        readonly FeedbackContract[];


    readonly state:

        EvolutionState;


    readonly createdAt: Date;


}
