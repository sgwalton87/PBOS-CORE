/*
===============================================================================

PBOS Governance Model

Authority

PBOS-CIP-009A-005

Classification

Governance Runtime Model

===============================================================================
*/


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



export interface GovernanceModel {


    readonly id: string;


    readonly authorities:

        readonly AuthorityContract[];


    readonly policies:

        readonly PolicyContract[];


    readonly approvals:

        readonly ApprovalContract[];


    readonly decisions:

        readonly GovernanceDecision[];


    readonly createdAt: Date;


}
