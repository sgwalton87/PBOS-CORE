/*
===============================================================================

PBOS Discovery Gateway

Classification

Gateway

Authority

PBS-DSC

===============================================================================

Purpose

The Discovery Gateway is the constitutional front door of PBOS Genesis.

It determines the organization's execution strategy and transfers execution
to the Discovery Orchestrator.

The Gateway SHALL remain deterministic.

===============================================================================

Execution

User

↓

Discovery Session

↓

Execution Mode

↓

Discovery Orchestrator

↓

Interview Adapter

Corpus Adapter

Repository Adapter

Hybrid Adapter

===============================================================================

Constitutional Law

Every organization SHALL pass through the Discovery Gateway.

No organization SHALL bypass Discovery.

===============================================================================
*/

import {

    DiscoveryRequest,

    DiscoveryResult

} from "../contracts/discover-contract";

export class DiscoveryGateway {

    async initialize(

        request: DiscoveryRequest

    ): Promise<DiscoveryResult> {

        void request;

        throw new Error(
            "Discovery Gateway not implemented."
        );

    }

}
