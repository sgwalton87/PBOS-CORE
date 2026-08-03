/*
===============================================================================

PBOS Evolution Report

Authority

PBOS-CIP-008A-012

Classification

Evolution Reporting

===============================================================================
*/


import {

    EvolutionModel

}

from "../modeling/evolution-model";



export interface EvolutionReport {


    readonly id: string;


    readonly evolutionId: string;


    readonly observationCount: number;


    readonly feedbackCount: number;


    readonly status: string;


    readonly generatedAt: Date;


}



export function createEvolutionReport(

    model: EvolutionModel

): EvolutionReport {



    return {


        id:

            crypto.randomUUID(),


        evolutionId:

            model.id,


        observationCount:

            model.observations.length,


        feedbackCount:

            model.feedback.length,


        status:

            model.state.status,


        generatedAt:

            new Date()


    };


}
