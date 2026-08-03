/*
===============================================================================

PBOS Canonical Organization Types

Classification

Intermediate Representation

Authority

PBS-ORG

===============================================================================

Purpose

Defines the canonical Intermediate Representation (IR) of an organization.

Every downstream compiler SHALL consume the same IR.

The Organization IR SHALL remain stable regardless of acquisition source.

Interview

Corpus

Repository

API

Database

Runtime

All SHALL compile into the same canonical representation.

===============================================================================
*/

export type OrganizationLifecycle =

    | "DISCOVERING"

    | "UNDERSTOOD"

    | "CERTIFIED"

    | "PLANNING"

    | "ENGINEERING"

    | "OPERATING"

    | "EVOLVING";

export interface CanonicalOrganization {

    readonly id: string;

    readonly name: string;

    readonly lifecycle: OrganizationLifecycle;

    readonly understanding: number;

}
