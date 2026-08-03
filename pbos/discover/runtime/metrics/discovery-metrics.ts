/*
===============================================================================

PBOS Discovery Metrics

Classification

Runtime Metrics

Authority

PBS-DSC

===============================================================================

Purpose

Discovery Metrics provide constitutional observability into Discovery
execution.

Metrics SHALL support operational insight.

Metrics SHALL NEVER influence constitutional reasoning.

===============================================================================

Published Metrics

• Discovery Duration

• Evidence Collected

• Confidence

• Understanding

• Knowledge Gaps

• Adapter Utilization

• Recovery Events

• Certification Readiness

===============================================================================

Constitutional Law

Metrics SHALL remain observational.

Metrics SHALL preserve execution history.

===============================================================================
*/

export interface DiscoveryMetrics {

    readonly evidenceCollected: number;

    readonly confidence: number;

    readonly organizationalUnderstanding: number;

    readonly discoveryDurationMs: number;

    readonly recoveryEvents: number;

    readonly certificationReady: boolean;

}
