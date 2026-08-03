/*
===============================================================================

PBOS Intermediate Representation Artifact

Authority

PBOS-PIR-005

===============================================================================

Purpose

Represents the canonical artifact exchanged between compiler stages.

Every compiler stage SHALL consume one PIR Artifact and produce a refined
PIR Artifact.

===============================================================================
*/

export interface PirArtifact {

    readonly id: string;

    readonly version: string;

    readonly createdAt: Date;

    readonly producer: string;

    readonly schema: string;

    readonly payload: unknown;

}
