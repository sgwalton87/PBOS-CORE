/*
===============================================================================

PBOS Acquisition Contract

Classification

Constitutional Contract

Authority

PBS-ACQ

===============================================================================

Purpose

The Acquisition Contract defines the constitutional interface for acquiring
organizational inputs prior to Discovery.

Acquisition SHALL collect inputs.

Acquisition SHALL NOT perform organizational reasoning.

===============================================================================
*/

export type AcquisitionMode =

    | "IDEA"
    | "DOCUMENTS"
    | "REPOSITORY"
    | "HYBRID";

export interface AcquisitionRequest {

    readonly mode: AcquisitionMode;

    readonly organizationName?: string;

}

export interface AcquisitionResult {

    readonly acquisitionId: string;

    readonly successful: boolean;

    readonly evidenceCollected: number;

}

export interface AcquisitionContract {

    acquire(

        request: AcquisitionRequest

    ): Promise<AcquisitionResult>;

}
