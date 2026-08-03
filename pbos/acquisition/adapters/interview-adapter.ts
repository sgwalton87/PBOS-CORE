/*
===============================================================================

PBOS Interview Adapter

Classification

Constitutional Acquisition Adapter

===============================================================================

Purpose

Acquire organizational knowledge through governed constitutional interviews.

The Interview Adapter SHALL preserve founder intent while transforming
conversation into Constitutional Evidence.

Conversation is an acquisition mechanism.

Evidence is the constitutional artifact.

===============================================================================
*/

import { AcquisitionAdapter } from "./adapter-contract";

export class InterviewAdapter implements AcquisitionAdapter {

    readonly name = "Interview Adapter";

    readonly supportedModes = [

        "GREENFIELD",

        "HYBRID"

    ];

    async acquire() {

        throw new Error(
            "Interview Adapter not implemented."
        );

    }

    async validate() {

        throw new Error(
            "Interview validation not implemented."
        );

    }

}
