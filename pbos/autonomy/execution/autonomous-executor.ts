import { randomUUID } from "crypto";
import { PlanApproval } from "../governance/human-approval-gate";
import { PlanAction, PlanModel } from "../planning/plan-model";
import { AutonomousExecutionResult } from "./execution-result";

export type ActionHandler = (action: PlanAction) => Promise<unknown>;

export class AutonomousExecutor {
    async execute(plan: PlanModel, approval: PlanApproval, handlers: Readonly<Record<string, ActionHandler>>): Promise<AutonomousExecutionResult> {
        if (approval.planId !== plan.planId || approval.disposition !== "APPROVED") {
            throw new Error("Plan execution requires matching explicit approval.");
        }
        const results = [];
        const errors: string[] = [];
        for (const action of plan.actions) {
            const handler = handlers[action.capability];
            if (!handler) {
                errors.push(`No approved handler for capability: ${action.capability}`);
                break;
            }
            try {
                results.push({ actionId: action.actionId, success: true, output: await handler(action), executedAt: new Date() });
            } catch (error) {
                errors.push(error instanceof Error ? error.message : String(error));
                results.push({ actionId: action.actionId, success: false, output: undefined, executedAt: new Date() });
                break;
            }
        }
        return {
            executionId: randomUUID(), planId: plan.planId, success: errors.length === 0 && results.length === plan.actions.length,
            actions: results, lineage: [...plan.provenance, plan.planId, approval.humanApprovalId ?? approval.authorityId ?? "authority"],
            errors, completedAt: new Date()
        };
    }
}
