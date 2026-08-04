/*
===============================================================================

PBOS System Acquisition Context

Authority

PBOS-CIP-010B-006

Classification

Genesis Acquisition Context

===============================================================================
*/


export interface SystemAcquisitionContext {


    readonly systemId: string;


    readonly systemName: string;


    readonly sourceRepository: string;


    readonly acquisitionMode:

        "READ_ONLY";


    readonly acquiredAt: Date;


    readonly metadata:

        Record<string, unknown>;


}
