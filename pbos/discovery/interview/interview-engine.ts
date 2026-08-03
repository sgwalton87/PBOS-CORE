/*
===============================================================================

PBOS Founder Interview Engine

Purpose

Conduct governed constitutional interviews that progressively discover an
organization while preserving founder intent.

The Interview Engine SHALL NEVER assume organizational truth.

It SHALL ask.

It SHALL listen.

It SHALL validate.

It SHALL learn.

===============================================================================
*/

import { DiscoveryContract } from "../contracts/discovery-contract";

export class InterviewEngine {

    constructor(
        readonly contract: DiscoveryContract
    ) {}

    async begin() {

        throw new Error(
            "Founder interview not implemented."
        );

    }

    async nextQuestion() {

        throw new Error(
            "Question generation not implemented."
        );

    }

    async recordAnswer() {

        throw new Error(
            "Answer recording not implemented."
        );

    }

    async validateUnderstanding() {

        throw new Error(
            "Understanding validation not implemented."
        );

    }

}
