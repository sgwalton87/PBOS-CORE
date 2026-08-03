/*
===============================================================================

PBOS Discovery Types

===============================================================================
*/

export type DiscoveryMode =

    | "GREENFIELD"

    | "EXISTING_ORGANIZATION"

    | "EXISTING_PLATFORM"

    | "HYBRID";

export interface DiscoveryQuestion {

    id: string;

    category: string;

    question: string;

    required: boolean;

}

export interface DiscoveryAnswer {

    questionId: string;

    answer: unknown;

    confidence: number;

}

export interface OrganizationalUnderstandingIndex {

    mission: number;

    vision: number;

    governance: number;

    capabilities: number;

    technology: number;

    operations: number;

    engineering: number;

    knowledge: number;

    overall: number;

}
