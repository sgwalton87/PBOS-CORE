/*
===============================================================================

PBOS Organization Report

Authority

PBOS-CIP-005A-012

Classification

Organizational Reporting

===============================================================================
*/

import {

    OrganizationModel

}

from "../modeling/organization-model";



export interface OrganizationReport {


    readonly id: string;


    readonly organizationId: string;


    readonly capabilityCount: number;


    readonly roleCount: number;


    readonly workflowCount: number;


    readonly confidence: number;


    readonly generatedAt: Date;


}



export function createOrganizationReport(

    model: OrganizationModel

): OrganizationReport {


    return {


        id:

            crypto.randomUUID(),


        organizationId:

            model.id,


        capabilityCount:

            model.capabilities.length,


        roleCount:

            model.roles.length,


        workflowCount:

            model.workflows.length,


        confidence:

            model.confidence,


        generatedAt:

            new Date()


    };

}
