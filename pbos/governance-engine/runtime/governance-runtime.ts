/*
===============================================================================

PBOS Governance Runtime

Authority

PBOS-CIP-009A-010

Classification

Governance Control Plane Runtime

===============================================================================
*/


import {

    GovernanceModel

}

from "../modeling/governance-model";


import {

    GovernanceBuilder

}

from "../modeling/governance-builder";


import {

    AuthorityEngine

}

from "../authority/authority-engine";


import {

    ApprovalEngine

}

from "../approval/approval-engine";


import {

    ChangeEvaluator

}

from "../evaluation/change-evaluator";



export class GovernanceRuntime {



    private readonly builder =

        new GovernanceBuilder();



    private readonly authorityEngine =

        new AuthorityEngine();



    private readonly approvalEngine =

        new ApprovalEngine();



    private readonly evaluator =

        new ChangeEvaluator();




    compile(

        changeId: string

    ): GovernanceModel {



        const authority =

            this.authorityEngine.create(

                "PBOS Constitutional Authority",

                "SYSTEM",

                [

                    "APPROVE_CHANGE"

                ]

            );



        const evaluation =

            this.evaluator.evaluate(

                changeId,

                1

            );



        const approval =

            this.approvalEngine.approve(

                changeId,

                authority.id,

                evaluation.reasons.join(

                    " "

                )

            );



        return this.builder.build(

            [

                authority

            ],

            [

                {

                    id:

                        crypto.randomUUID(),

                    name:

                        "Evolution Change Policy",

                    scope:

                        "CHANGE",

                    rules:

                        [

                            "Changes require authority."

                        ],

                    active:

                        true,

                    createdAt:

                        new Date(),

                    metadata: {}

                }

            ],

            [

                approval

            ],

            [

                {

                    id:

                        crypto.randomUUID(),

                    changeId,

                    authorityId:

                        authority.id,

                    policyIds:

                        [],

                    status:

                        evaluation.approved

                            ? "AUTHORIZED"

                            : "DENIED",

                    explanation:

                        evaluation.reasons.join(

                            " "

                        ),

                    createdAt:

                        new Date(),

                    metadata: {}

                }

            ]

        );


    }


}
