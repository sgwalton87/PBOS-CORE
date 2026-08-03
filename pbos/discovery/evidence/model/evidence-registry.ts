/*
===============================================================================

PBOS Discovery Evidence Registry

Classification

Evidence Model

Authority

PBS-DSC

===============================================================================

Purpose

The Discovery Evidence Registry maintains the canonical inventory of
Constitutional Evidence generated during Discovery.

The Registry preserves provenance, lineage, identity, and certification
status for every evidence artifact.

===============================================================================

Responsibilities

• register evidence

• resolve evidence

• preserve provenance

• preserve lineage

• support certification

===============================================================================

Constitutional Law

Evidence SHALL remain immutable after registration.

Every evidence artifact SHALL possess one canonical identity.

===============================================================================
*/

import { EvidenceProvenance } from "./provenance";

export interface DiscoveryEvidence {

    readonly id: string;

    readonly type: string;

    readonly title: string;

    readonly provenance: EvidenceProvenance;

    readonly createdAt: Date;

}

export class DiscoveryEvidenceRegistry {

    async register(
        evidence: DiscoveryEvidence
    ): Promise<void> {

        void evidence;

        throw new Error(
            "Evidence registration not implemented."
        );

    }

    async resolve(
        id: string
    ): Promise<DiscoveryEvidence | null> {

        void id;

        throw new Error(
            "Evidence resolution not implemented."
        );

    }

}
