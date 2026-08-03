/*
===============================================================================

PBOS Discovery Intelligence Contract

Authority

PBOS-DI-002

Classification

Constitutional Engine Contract

===============================================================================

Purpose

Defines the constitutional execution contract for the Discovery Intelligence
Engine.

Discovery Intelligence SHALL transform organizational evidence into a governed,
traceable, and explainable Organizational Understanding.

===============================================================================
*/

export interface DiscoveryIntelligenceRequest {

    readonly organizationId?: string;

    readonly sessionId?: string;

}

export interface DiscoveryIntelligenceResult {

    readonly success: boolean;

    readonly discoveryReportId: string;

    readonly knowledgeGraphId: string;

    readonly understandingId: string;

}

export interface DiscoveryIntelligenceContract {

    initialize(): Promise<void>;

    execute(

        request: DiscoveryIntelligenceRequest

    ): Promise<DiscoveryIntelligenceResult>;

}
