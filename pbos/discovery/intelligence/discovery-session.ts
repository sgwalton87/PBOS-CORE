/*
===============================================================================

PBOS Discovery Session

Purpose

A Discovery Session represents one governed constitutional learning lifecycle
between PBOS Genesis and an organization.

The session preserves:

• founder intent

• discovery progress

• evidence

• organizational confidence

• constitutional lineage

===============================================================================
*/

export interface DiscoverySession {

    readonly sessionId: string;

    readonly organizationId: string;

    readonly founderId: string;

    readonly startedAt: Date;

    readonly lastActivityAt: Date;

    readonly currentState: string;

    readonly completedDomains: readonly string[];

    readonly remainingDomains: readonly string[];

    readonly organizationalUnderstandingIndex: number;

}
