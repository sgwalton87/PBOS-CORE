/*
===============================================================================

PBOS Acquisition Types

Classification

Constitutional Types

Authority

PBS-ACQ

===============================================================================

Purpose

Defines the canonical acquisition types used throughout Constitutional
Discovery.

===============================================================================
*/

export type AcquisitionSource =

    | "FOUNDER"

    | "INTERVIEW"

    | "DOCUMENT"

    | "REPOSITORY"

    | "API"

    | "IMPORT";

export interface AcquisitionArtifact {

    readonly id: string;

    readonly source: AcquisitionSource;

    readonly name: string;

    readonly collectedAt: Date;

    readonly provenance: string;

}
