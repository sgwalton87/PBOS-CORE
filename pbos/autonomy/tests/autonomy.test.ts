import { describe, expect, it } from "vitest";
import {
    AutonomousExecutor, AutonomyFeedbackLoop, HumanApprovalGate,
    MissionRequest, OutcomeEvaluator, PlanningEngine
} from "../index";

const mission: MissionRequest = {
    missionId: "mission", systemId: "system", requestedBy: "actor", objective: "Improve outcome",
    context: {}, authority: { allowed: true, actorId: "actor", action: "EXECUTE_MISSION", authorityId: "authority", reason: "permitted" },
    constraints: ["preserve human control"], expectedOutcome: { status: "complete" }, requestedAt: new Date()
};

describe("PBOS Autonomous Operations Layer", () => {
    it("creates governed plans from mission objectives", () => {
        const plan = new PlanningEngine().plan(mission, [{ capability: "review", description: "Review context", risk: "LOW" }]);
        expect(plan.status).toBe("AWAITING_APPROVAL");
        expect(plan.provenance).toEqual(["mission"]);
    });

    it("denies unknown authority and escalates irreversible actions", () => {
        const plan = new PlanningEngine().plan(mission, [{ capability: "change", description: "Make change", risk: "IRREVERSIBLE" }]);
        const gate = new HumanApprovalGate();
        expect(gate.evaluate(plan, { allowed: false, actorId: "actor", action: "EXECUTE", reason: "unknown" }).disposition).toBe("DENIED");
        expect(gate.evaluate(plan, mission.authority).disposition).toBe("ESCALATION_REQUIRED");
        expect(gate.evaluate(plan, mission.authority, "human-approval").disposition).toBe("APPROVED");
    });

    it("executes only approved plans through explicit capability handlers", async () => {
        const plan = new PlanningEngine().plan(mission, [{ capability: "review", description: "Review", risk: "LOW" }]);
        const gate = new HumanApprovalGate();
        await expect(new AutonomousExecutor().execute(plan, gate.evaluate(plan, {
            allowed: false, actorId: "actor", action: "EXECUTE", reason: "denied"
        }), {})).rejects.toThrow("explicit approval");
        const result = await new AutonomousExecutor().execute(plan, gate.evaluate(plan, mission.authority), {
            review: async () => ({ status: "complete" })
        });
        expect(result.success).toBe(true);
        expect(result.lineage).toContain("mission");
    });

    it("stops safely when an action handler fails", async () => {
        const plan = new PlanningEngine().plan(mission, [{ capability: "fail", description: "Fail safely", risk: "LOW" }]);
        const result = await new AutonomousExecutor().execute(plan, new HumanApprovalGate().evaluate(plan, mission.authority), {
            fail: async () => { throw new Error("controlled failure"); }
        });
        expect(result.success).toBe(false);
        expect(result.errors).toEqual(["controlled failure"]);
    });

    it("evaluates outcomes and emits evolution feedback", async () => {
        const plan = new PlanningEngine().plan(mission, [{ capability: "review", description: "Review", risk: "LOW" }]);
        const execution = await new AutonomousExecutor().execute(plan, new HumanApprovalGate().evaluate(plan, mission.authority), {
            review: async () => ({ status: "complete" })
        });
        const evaluation = new OutcomeEvaluator().evaluate(mission, execution, { status: "complete" });
        expect(evaluation.metExpectedOutcome).toBe(true);
        expect(new AutonomyFeedbackLoop().create(evaluation, execution.lineage).score).toBe(1);
    });
});
