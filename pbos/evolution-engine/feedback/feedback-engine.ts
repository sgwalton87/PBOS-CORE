/*
===============================================================================

PBOS Feedback Engine

Authority

PBOS-CIP-008A-008

Classification

Evolution Runtime

===============================================================================
*/


import {

    FeedbackContract

}

from "../contracts/feedback-contract";



export class FeedbackEngine {



    create(

        executionId: string,

        message: string,

        confidence: number

    ): FeedbackContract {



        return {


            id:

                crypto.randomUUID(),


            sourceExecutionId:

                executionId,


            type:

                "INSIGHT",


            message,


            confidence,


            createdAt:

                new Date(),


            metadata: {

                source:

                    "FeedbackEngine"

            }


        };


    }


}
