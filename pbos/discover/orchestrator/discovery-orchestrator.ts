/*
===============================================================================

PBOS Discovery Orchestrator

Classification

Constitutional Orchestrator

Authority

PBS-DSC

===============================================================================

Purpose

The Discovery Orchestrator coordinates Constitutional Discovery.

It SHALL resolve the appropriate Discovery Adapter based upon the selected
Constitutional Execution Mode.

The Orchestrator coordinates execution.

It SHALL NOT perform Discovery itself.

===============================================================================

Execution

Discovery Session

↓

Execution Mode

↓

Adapter Resolution

↓

Discovery Adapter

↓

Evidence Collection

↓

Evidence Fusion

↓

Organizational Understanding

===============================================================================

Constitutional Law

The Orchestrator SHALL remain deterministic.

The Orchestrator SHALL preserve constitutional state.

The Orchestrator SHALL remain provider independent.

===============================================================================
*/

import {
    DiscoveryExecutionMode,
    DiscoverySession
} from "../types/discovery-session";

export class DiscoveryOrchestrator {

    async orchestrate(
        session: DiscoverySession,
        mode: DiscoveryExecutionMode
    ): Promise<void> {

        void session;
        void mode;

        throw new Error(
            "Discovery Orchestrator not implemented."
        );

    }

}
