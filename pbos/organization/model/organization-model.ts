/*
===============================================================================

PBOS Canonical Organization Model

Classification

Constitutional Model

Authority

PBS-ORG

===============================================================================

Purpose

The Canonical Organization Model represents the normalized organizational
structure produced by the Organization Compiler.

The Organization Model SHALL preserve organizational identity while exposing
capabilities, roles, governance, processes, systems, and relationships in a
deterministic form suitable for downstream Constitutional Engines.

The Organization Model SHALL become one component of the Canonical
Organization Intermediate Representation (COIR).

===============================================================================

Model Components

Identity

↓

Mission

↓

Vision

↓

Capabilities

↓

Roles

↓

Processes

↓

Systems

↓

Governance

↓

Evidence

===============================================================================

Constitutional Law

The Organization Model SHALL remain deterministic.

The Organization Model SHALL preserve founder intent.

The Organization Model SHALL preserve constitutional authority.

===============================================================================
*/

export interface OrganizationModel {

    readonly organizationId: string;

    readonly name: string;

    readonly mission: string;

    readonly vision?: string;

    readonly capabilities: readonly string[];

    readonly roles: readonly string[];

    readonly processes: readonly string[];

    readonly systems: readonly string[];

    readonly governance: readonly string[];

}
