/*
===============================================================================

PBOS Playbook Compilation Target

Authority

PBOS-CIP-010B-009

Classification

Genesis Compilation Contract

===============================================================================
*/


import {

    SystemArtifact

}

from "./system-artifact";



export interface PlaybookCompilationTarget {


    readonly targetId: string;


    readonly systemArtifact: SystemArtifact;


    readonly compilationReady: boolean;


    readonly createdAt: Date;


    readonly metadata:

        Record<string, unknown>;


}
