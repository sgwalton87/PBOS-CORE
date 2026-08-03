/*
===============================================================================

PBOS Intermediate Representation Contract

Authority

PBOS-PIR-002

Classification

Constitutional Contract

===============================================================================

Purpose

Defines the constitutional execution contract governing all PBOS Intermediate
Representation operations.

Every compiler SHALL consume PIR and produce a refined PIR.

===============================================================================
*/

import { PirArtifact } from "../artifacts/pir-artifact";
import { PirContext } from "../context/pir-context";

export interface PirContract {

    initialize(): Promise<void>;

    execute(

        context: PirContext

    ): Promise<PirArtifact>;

}
