import { randomUUID } from "crypto";
import { AutonomyEvaluationResult } from "../evaluation/evaluation-result";

export interface AutonomyFeedback {
    readonly feedbackId: string;
    readonly missionId: string;
    readonly score: number;
    readonly signals: readonly string[];
    readonly provenance: readonly string[];
    readonly createdAt: Date;
}

export class AutonomyFeedbackLoop {
    create(evaluation: AutonomyEvaluationResult, lineage: readonly string[]): AutonomyFeedback {
        return {
            feedbackId: randomUUID(), missionId: evaluation.missionId, score: evaluation.score,
            signals: evaluation.improvementSignals, provenance: [...lineage], createdAt: new Date()
        };
    }
}
