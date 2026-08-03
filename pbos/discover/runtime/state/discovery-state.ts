/*
===============================================================================

PBOS Discovery Runtime State

Classification

Runtime State

Authority

PBS-DSC

===============================================================================

Purpose

Represents the observable execution state of an active Discovery Session.

Runtime State SHALL support deterministic execution, replay, recovery,
certification, and observability.

===============================================================================
*/

export type DiscoveryRuntimeStage =

    | "INITIALIZED"
    | "GATEWAY"
    | "MODE_SELECTION"
    | "ADAPTER_RESOLUTION"
    | "EVIDENCE_ACQUISITION"
    | "EVIDENCE_PROCESSING"
    | "UNDERSTANDING"
    | "READINESS"
    | "CERTIFICATION"
    | "COMPLETED"
    | "FAILED";

export interface DiscoveryRuntimeState {

    readonly sessionId: string;

    readonly stage: DiscoveryRuntimeStage;

    readonly progress: number;

    readonly completedStages: readonly DiscoveryRuntimeStage[];

    readonly blockingIssues: readonly string[];

    readonly updatedAt: Date;

}
