/*
===============================================================================

PBOS Acquisition Report Contract

Authority

PBOS-CIP-010A-003

Classification

Acquisition Reporting Contract

===============================================================================
*/


export interface AcquisitionReport {


    readonly id: string;


    readonly systemName: string;


    readonly repositoryIdentity: string;


    readonly filesDiscovered: number;


    readonly architectureComponents: number;


    readonly dependenciesDiscovered: number;


    readonly capabilitiesDetected: number;


    readonly status:

        "INITIALIZED"

        | "SCANNED"

        | "COMPLETED"

        | "FAILED";


    readonly createdAt: Date;


    readonly metadata:

        Record<string, unknown>;


}
