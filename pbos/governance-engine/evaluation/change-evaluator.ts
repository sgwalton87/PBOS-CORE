/*
===============================================================================

PBOS Change Evaluator

Authority

PBOS-CIP-009A-008

Classification

Governance Evaluation Runtime

===============================================================================
*/


export interface ChangeEvaluation {


    readonly approved: boolean;


    readonly reasons: readonly string[];


}



export class ChangeEvaluator {



    evaluate(

        changeId: string,

        policyCount: number

    ): ChangeEvaluation {



        return {


            approved:

                policyCount > 0,


            reasons:

                policyCount > 0

                    ?

                    [

                        `Change ${changeId} satisfies policy review.`

                    ]

                    :

                    [

                        "No governing policies found."

                    ]


        };


    }


}
