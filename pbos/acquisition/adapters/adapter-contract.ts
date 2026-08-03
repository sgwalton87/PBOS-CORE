/*
===============================================================================

PBOS Acquisition Adapter Contract

===============================================================================

Purpose

Every Constitutional Acquisition Adapter SHALL implement this contract.

Adapters translate external organizational knowledge into Constitutional
Evidence.

Adapters SHALL NOT perform constitutional reasoning.

===============================================================================
*/

export interface AcquisitionAdapter {

    readonly name: string;

    readonly supportedModes: readonly string[];

    acquire(): Promise<void>;

    validate(): Promise<void>;

}
