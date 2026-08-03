/*
===============================================================================

PBOS Stage Result

Authority

PBOS-CIP-001

Classification

Constitutional Runtime

===============================================================================
*/

export interface StageResult {

    readonly stageId: string;

    readonly stageName: string;

    readonly success: boolean;

    readonly startedAt: Date;

    readonly completedAt: Date;

    readonly durationMs: number;

    readonly artifacts: readonly string[];

    readonly diagnostics: readonly string[];

}
