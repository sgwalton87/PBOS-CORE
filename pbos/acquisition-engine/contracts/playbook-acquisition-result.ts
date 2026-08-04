/*
===============================================================================

PBOS Playbook Acquisition Result Contract

Authority

PBOS-CIP-010B-005

Classification

Production Acquisition Contract

===============================================================================
*/


export interface PlaybookAcquisitionResult {


    readonly systemId: string;


    readonly systemName: string;


    readonly artifactType: "SYSTEM";


    readonly acquired: boolean;


    readonly createdAt: Date;


    readonly metadata:

        Record<string, unknown>;


}
