/*
===============================================================================

PBOS Governance Builder

Authority

PBOS-CIP-009A-006

Classification

Governance Runtime Compiler

===============================================================================
*/


import {

    GovernanceModel

}

from "./governance-model";


import {

    AuthorityContract

}

from "../contracts/authority-contract";


import {

    ApprovalContract

}

from "../contracts/approval-contract";


import {

    PolicyContract

}

from "../contracts/policy-contract";


import {

    GovernanceDecision

}

from "../contracts/governance-decision";



export class GovernanceBuilder {



    build(

        authorities: readonly AuthorityContract[],

        policies: readonly PolicyContract[],

        approvals: readonly ApprovalContract[],

        decisions: readonly GovernanceDecision[]

    ): GovernanceModel {



        return {


            id:

                crypto.randomUUID(),


            authorities,


            policies,


            approvals,


            decisions,


            createdAt:

                new Date()


        };


    }


}
