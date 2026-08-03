/*
===============================================================================

PBOS Mission Planner Contract

===============================================================================
*/

export interface PlannerContract {

    readonly planningId: string;

    readonly organizationId: string;

    readonly constitutionalAuthority: string;

    readonly preserveFounderIntent: boolean;

    readonly preserveEvidenceLineage: boolean;

    readonly deterministicPlanning: boolean;

    readonly certificationRequired: boolean;

}

export interface PlanningResult {

    readonly missionQueueGenerated: boolean;

    readonly workPackagesGenerated: number;

    readonly dependenciesResolved: boolean;

    readonly engineeringReady: boolean;

}
