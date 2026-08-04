import { MissionRequest } from "../contracts/mission-request";
import { AutonomousExecutionResult } from "../execution/execution-result";
import { AutonomyEvaluationResult } from "./evaluation-result";

export class OutcomeEvaluator {
    evaluate(mission: MissionRequest, execution: AutonomousExecutionResult, actual: Readonly<Record<string, unknown>>): AutonomyEvaluationResult {
        const expected = Object.entries(mission.expectedOutcome);
        const differences = expected
            .filter(([key, value]) => actual[key] !== value)
            .map(([key]) => `Expected outcome not met: ${key}`);
        if (!execution.success) differences.push(...execution.errors);
        const score = expected.length === 0 ? (execution.success ? 1 : 0) :
            Math.max(0, (expected.length - differences.length) / expected.length);
        return {
            missionId: mission.missionId,
            metExpectedOutcome: execution.success && differences.length === 0,
            score,
            differences,
            improvementSignals: differences.map(difference => `Review: ${difference}`),
            evaluatedAt: new Date()
        };
    }
}
