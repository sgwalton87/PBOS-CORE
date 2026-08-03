/*
===============================================================================

PBOS Organizational Capability Model

Classification

Constitutional Model

Authority

PBS-ORG

===============================================================================

Purpose

Organizational Capabilities define WHAT an organization is constitutionally
capable of doing.

Capabilities are independent of software, departments, or people.

Capabilities represent enduring organizational functions.

Software implements capabilities.

Capabilities define the organization.

===============================================================================

Constitutional Law

Capabilities SHALL be technology independent.

Capabilities SHALL remain traceable to Constitutional Evidence.

Capabilities SHALL become the foundation of Mission Generation.

===============================================================================
*/

export interface CapabilityModel {

    readonly capabilityId: string;

    readonly name: string;

    readonly description: string;

    readonly parentCapability?: string;

    readonly evidence: readonly string[];

    readonly confidence: number;

}
