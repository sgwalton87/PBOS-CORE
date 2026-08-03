/*
===============================================================================

PBOS Constitutional Corpus Adapter

Classification

Constitutional Acquisition Adapter

===============================================================================

Purpose

Acquire organizational understanding from an existing Constitutional Corpus.

Examples

• Constitution

• Charter

• Vision

• Specifications

• Architecture

• Engineering

• Policies

• Standards

• ADRs

The Corpus Adapter SHALL transform organizational documentation into
Constitutional Evidence.

It SHALL preserve provenance for every imported artifact.

===============================================================================
*/

import { AcquisitionAdapter } from "./adapter-contract";

export class CorpusAdapter implements AcquisitionAdapter {

    readonly name = "Corpus Adapter";

    readonly supportedModes = [

        "CONSTITUTIONAL_CORPUS",

        "HYBRID"

    ];

    async acquire() {

        throw new Error(
            "Corpus acquisition not implemented."
        );

    }

    async validate() {

        throw new Error(
            "Corpus validation not implemented."
        );

    }

}
