/*
===============================================================================

PBOS Registered System Contract

Authority

PBOS-CIP-010B-011

Classification

Genesis Compilation Registration Contract

===============================================================================
*/


import {

    SystemArtifact

}

from "./system-artifact";



export interface RegisteredSystem {


    readonly id: string;


    readonly systemId: string;


    readonly systemName: string;


    readonly artifact:

        SystemArtifact;


    readonly lifecycleState:

        "REGISTERED"

        | "COMPILING"

        | "COMPILED";


    readonly registeredAt: Date;


    readonly metadata:

        Record<string, unknown>;


}
