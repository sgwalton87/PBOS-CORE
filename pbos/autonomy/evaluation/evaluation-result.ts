export interface AutonomyEvaluationResult {
    readonly missionId: string;
    readonly metExpectedOutcome: boolean;
    readonly score: number;
    readonly differences: readonly string[];
    readonly improvementSignals: readonly string[];
    readonly evaluatedAt: Date;
}
