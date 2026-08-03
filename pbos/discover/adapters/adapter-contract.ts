/*
===============================================================================

PBOS Discovery Adapter Contract

Classification

Constitutional Contract

Authority

PBS-DSC

===============================================================================

Purpose

Every Discovery Adapter SHALL implement this contract.

Discovery Adapters acquire Constitutional Evidence.

Discovery Adapters SHALL NOT perform organizational reasoning.

===============================================================================
*/

import { DiscoverySession } from "../types/discovery-session";

export interface DiscoveryAdapter {

    readonly id: string;

    readonly name: string;

    readonly version: string;

    discover(
        session: DiscoverySession
    ): Promise<void>;

}
