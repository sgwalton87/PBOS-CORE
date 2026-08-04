/*
===============================================================================

PBOS Acquisition Report

Authority

PBOS-CIP-010A-010

Classification

Acquisition Reporting Runtime

===============================================================================
*/


import {

    SystemArtifact

}

from "../contracts/system-artifact";



export interface AcquisitionRuntimeReport {


    readonly id: string;


    readonly systemName: string;


    readonly repositoryIdentity: string;


    readonly dependencyCount: number;


    readonly capabilityCount: number;


    readonly status:

        "ACQUIRED"

        | "FAILED";


    readonly createdAt: Date;


}



export function createAcquisitionReport(

    artifact: SystemArtifact

): AcquisitionRuntimeReport {



    return {


        id:

            crypto.randomUUID(),


        systemName:

            artifact.systemName,


        repositoryIdentity:

            artifact.repositoryIdentity,


        dependencyCount:

            artifact.dependencies.length,


        capabilityCount:

            artifact.capabilities.length,


        status:

            "ACQUIRED",


        createdAt:

            new Date()


    };


}
