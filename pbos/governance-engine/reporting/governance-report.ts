/*
===============================================================================

PBOS Governance Report

Authority

PBOS-CIP-009A-012

Classification

Governance Reporting

===============================================================================
*/


import {

    GovernanceModel

}

from "../modeling/governance-model";



export interface GovernanceReport {


    readonly id: string;


    readonly governanceId: string;


    readonly authorityCount: number;


    readonly policyCount: number;


    readonly decisionCount: number;


    readonly generatedAt: Date;


}



export function createGovernanceReport(

    model: GovernanceModel

): GovernanceReport {



    return {


        id:

            crypto.randomUUID(),


        governanceId:

            model.id,


        authorityCount:

            model.authorities.length,


        policyCount:

            model.policies.length,


        decisionCount:

            model.decisions.length,


        generatedAt:

            new Date()


    };


}
