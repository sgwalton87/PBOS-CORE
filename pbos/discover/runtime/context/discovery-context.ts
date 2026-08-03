/*
===============================================================================

PBOS Discovery Context

Classification

Runtime Context

Authority

PBS-DSC

===============================================================================

Purpose

Represents the immutable Constitutional Context of one Discovery execution.

The Context SHALL preserve:

• session identity

• organization identity

• execution mode

• runtime identity

• timestamps

• constitutional authority

===============================================================================
*/

export interface DiscoveryContext {

    readonly sessionId: string;

    readonly organizationId?: string;

    readonly executionMode: string;

    readonly runtimeVersion: string;

    readonly authority: string;

    readonly startedAt: Date;

}
