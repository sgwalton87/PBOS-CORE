/*
===============================================================================

PBOS Constitutional Acquisition Orchestrator

Classification

Constitutional Engine

Authority

PBOS Constitutional Acquisition

===============================================================================

Purpose

The Acquisition Orchestrator coordinates every Constitutional Acquisition
workflow.

It determines which acquisition adapters shall participate in organizational
understanding while preserving constitutional governance.

The Orchestrator SHALL coordinate.

Adapters SHALL acquire.

Discovery SHALL reason.

===============================================================================

Responsibilities

• interpret Discovery Mode

• activate governed acquisition adapters

• coordinate evidence acquisition

• normalize acquired evidence

• deliver Constitutional Evidence to Discovery Intelligence

===============================================================================

Constitutional Law

The Orchestrator SHALL NEVER perform discovery.

The Orchestrator SHALL NEVER reason about organizations.

The Orchestrator SHALL coordinate acquisition only.

===============================================================================
*/

import { DiscoveryMode } from "../gateway/discovery-mode";

export class AcquisitionOrchestrator {

    async orchestrate(
        mode: DiscoveryMode
    ) {

        throw new Error(
            "Acquisition Orchestrator not implemented."
        );

    }

}
