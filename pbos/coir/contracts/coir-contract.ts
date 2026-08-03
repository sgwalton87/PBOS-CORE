/*
===============================================================================

PBOS COIR Compiler Contract

Authority

PBOS-COIR-002

Classification

Constitutional Contract

===============================================================================

Purpose

Defines the constitutional execution contract governing the Canonical
Organizational Intermediate Representation Compiler.

Every execution SHALL consume a PIR Artifact and produce a refined PIR
containing the Canonical Organizational Intermediate Representation.

===============================================================================
*/

import { PirArtifact } from "../../pir";

export interface CoirCompilerContract {

    initialize(): Promise<void>;

    compile(

        artifact: PirArtifact

    ): Promise<PirArtifact>;

}
