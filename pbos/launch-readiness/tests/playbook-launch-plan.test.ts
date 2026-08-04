import { describe, expect, it } from "vitest";
import { PLAYBOOK_LAUNCH_TASKS, PlaybookLaunchPlanCompiler } from "../index";

describe("CIP-046 through CIP-049 Playbook launch plan", () => {
    it("covers every CIP with explicit evidence and approval gates", () => {
        const compiler = new PlaybookLaunchPlanCompiler();
        const plan = compiler.compile([]);
        expect(new Set(PLAYBOOK_LAUNCH_TASKS.map(task => task.cip))).toEqual(new Set(["CIP-046", "CIP-047", "CIP-048", "CIP-049"]));
        expect(plan.readyForPublicLaunch).toBe(false);
        expect(plan.tasks.some(task => task.gate === "HUMAN_APPROVAL")).toBe(true);
        expect(plan.tasks.some(task => task.gate === "EXTERNAL_ACCOUNT")).toBe(true);
    });

    it("never unlocks dependent launch work from invalid evidence", () => {
        const plan = new PlaybookLaunchPlanCompiler().compile([
            { evidenceId: "invalid", taskId: "048-repository-gap-analysis", valid: false }
        ]);
        expect(plan.tasks.find(task => task.taskId === "048-foundation")?.state).toBe("BLOCKED");
    });

    it("unlocks the next task only after its dependencies are proven", () => {
        const compiler = new PlaybookLaunchPlanCompiler();
        const plan = compiler.compile([
            { evidenceId: "gap-report", taskId: "048-repository-gap-analysis", valid: true }
        ]);
        expect(plan.tasks.find(task => task.taskId === "048-foundation")?.state).toBe("READY");
        expect(compiler.byCip(plan, "CIP-049")).toHaveLength(4);
    });
});
