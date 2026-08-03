/*
===============================================================================

PBOS Discovery Report

Classification

Constitutional Artifact

Authority

PBS-DSC

===============================================================================

Purpose

The Discovery Report summarizes Constitutional Discovery.

The Report SHALL become the official transition artifact between Discovery
and Organization Modeling.

===============================================================================

Contents

Discovery Session

Organizational Understanding

Confidence

Capability Inventory

Knowledge Gaps

Evidence Summary

Recommended Next Actions

===============================================================================

Constitutional Law

Discovery Reports SHALL remain immutable after certification.

Discovery Reports SHALL preserve complete evidence lineage.

===============================================================================
*/

export interface DiscoveryReport {

    readonly reportId: string;

    readonly sessionId: string;

    readonly understanding: number;

    readonly confidence: number;

    readonly capabilityCount: number;

    readonly evidenceCount: number;

    readonly generatedAt: Date;

}
