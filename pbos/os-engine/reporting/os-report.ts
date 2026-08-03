/*
===============================================================================

PBOS Operating System Report

Authority

PBOS-CIP-006A-012

Classification

Operating System Reporting

===============================================================================
*/


import {

    OperatingSystemModel

}

from "../modeling/operating-system-model";



export interface OSReport {


    readonly id: string;


    readonly operatingSystemId: string;


    readonly missionCount: number;


    readonly roleCount: number;


    readonly workflowCount: number;


    readonly confidence: number;


    readonly generatedAt: Date;


}



export function createOSReport(

    model: OperatingSystemModel

): OSReport {


    return {


        id:

            crypto.randomUUID(),


        operatingSystemId:

            model.id,


        missionCount:

            model.missions.length,


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
