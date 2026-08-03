/*
===============================================================================

PBOS Discovery Session

Classification

Constitutional Artifact

Authority

PBS-DSC

===============================================================================

Purpose

A Discovery Session represents the durable constitutional state of an active
organizational discovery lifecycle.

Every organization SHALL possess one active Discovery Session during
constitutional acquisition.

The Discovery Session SHALL become the authoritative source of discovery state.

===============================================================================
*/

export type DiscoveryExecutionMode =

    | "GREENFIELD"

    | "BROWNFIELD"

    | "HYBRID"

    | "INTERNAL_EVOLUTION";

export type DiscoveryStatus =

    | "INITIALIZED"

    | "DISCOVERING"

    | "UNDERSTANDING"

    | "MODELING"

    | "COMPLETED"

    | "FAILED";

export interface DiscoverySession {

    readonly sessionId: string;

    readonly organizationId?: string;

    readonly executionMode: DiscoveryExecutionMode;

    readonly status: DiscoveryStatus;

    readonly understanding: number;

    readonly confidence: number;

    readonly evidenceCollected: number;

    readonly artifactsGenerated: readonly string[];

    readonly createdAt: Date;

    readonly updatedAt: Date;

}
