import { randomUUID } from "crypto";
import { MissionRequest } from "../contracts/mission-request";
import { ActionRisk, PlanModel } from "./plan-model";

export interface RequestedAction {
    readonly actionId?: string;
    readonly capability: string;
    readonly description: string;
    readonly dependencyIds?: readonly string[];
    readonly risk?: ActionRisk;
}

export class PlanningEngine {
    plan(mission: MissionRequest, requestedActions: readonly RequestedAction[]): PlanModel {
        if (requestedActions.length === 0) throw new Error("Mission planning requires at least one proposed action.");
        const actions = requestedActions.map(action => ({
            actionId: action.actionId ?? randomUUID(),
            capability: action.capability,
            description: action.description,
            dependencyIds: action.dependencyIds ?? [],
            risk: action.risk ?? "MEDIUM",
            expectedOutcome: mission.expectedOutcome
        }));
        const available = new Set(actions.map(action => action.actionId));
        for (const action of actions) {
            const missing = action.dependencyIds.filter(id => !available.has(id));
            if (missing.length > 0) throw new Error(`Plan action dependencies missing: ${missing.join(", ")}`);
        }
        return {
            planId: randomUUID(), missionId: mission.missionId, actions,
            constraints: mission.constraints, estimatedOutcome: mission.expectedOutcome,
            status: "AWAITING_APPROVAL", provenance: [mission.missionId], createdAt: new Date()
        };
    }
}
