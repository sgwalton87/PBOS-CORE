/*
===============================================================================

PBOS Evidence Source Contract

Authority

PBOS-CIP-003A-002

===============================================================================
*/

export type EvidenceSourceType =

    | "USER"

    | "DOCUMENT"

    | "DATABASE"

    | "API"

    | "SYSTEM"

    | "EXTERNAL";


export interface EvidenceSource {

    readonly id: string;

    readonly type: EvidenceSourceType;

    readonly name: string;

    readonly description: string;

    readonly location?: string;

    readonly verified: boolean;

    readonly metadata: Record<string, unknown>;

}
