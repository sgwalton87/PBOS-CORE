/*
===============================================================================

PBOS Discovery Contract

Classification

Constitutional Contract

Authority

PBS-DSC

===============================================================================

Purpose

Defines the constitutional execution contract for Discovery.

Discovery SHALL initialize constitutional understanding.

Discovery SHALL NOT perform engineering.

===============================================================================
*/

import {

    DiscoveryExecutionMode,

    DiscoverySession

} from "../types/discovery-session";

export interface DiscoveryRequest {

    readonly executionMode: DiscoveryExecutionMode;

    readonly organizationName?: string;

}

export interface DiscoveryResult {

    readonly session: DiscoverySession;

    readonly initialized: boolean;

    readonly nextEngine: string;

}

export interface DiscoveryContract {

    initialize(

        request: DiscoveryRequest

    ): Promise<DiscoveryResult>;

}
