/*
===============================================================================

PBOS Discovery Certifier

Purpose

Determine whether Constitutional Discovery has produced sufficient governed
organizational understanding for autonomous engineering.

The Discovery Certifier SHALL NEVER certify incomplete constitutional
knowledge.

Possible outcomes:

• READY

• CONTINUE_DISCOVERY

• HUMAN_DECISION_REQUIRED

===============================================================================
*/

export type DiscoveryCertificationDecision =

    | "READY"

    | "CONTINUE_DISCOVERY"

    | "HUMAN_DECISION_REQUIRED";

export class DiscoveryCertifier {

    async certify(): Promise<DiscoveryCertificationDecision> {

        throw new Error(
            "Discovery Certifier not implemented."
        );

    }

}
