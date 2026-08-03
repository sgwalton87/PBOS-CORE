/*
===============================================================================

PBOS Discovery State

Purpose

Discovery State represents PBOS' current constitutional understanding of an
organization.

Rather than tracking conversation history, Discovery State tracks
organizational knowledge.

Discovery SHALL always reason from state, not from conversation.

===============================================================================
*/

export interface DiscoveryState {

    readonly knownFacts: readonly string[];

    readonly unknownFacts: readonly string[];

    readonly assumptions: readonly string[];

    readonly evidenceCollected: readonly string[];

    readonly confidence: number;

    readonly nextDiscoveryObjective: string;

    readonly engineeringReady: boolean;

}
