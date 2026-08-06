import { describe, expect, it } from "vitest";
import { PLAYBOOK_LAUNCH_TASKS, PlaybookLaunchPlanCompiler } from "../index";

const proof = (taskId: string, overrides: Partial<import("../index").LaunchEvidence> = {}): import("../index").LaunchEvidence => {
    const task = PLAYBOOK_LAUNCH_TASKS.find(item => item.taskId === taskId)!;
    return { evidenceId: `evidence:${taskId}`, taskId, valid: true,
        evidenceType: task.gate === "AUTOMATED" ? "PLATFORM_ARTIFACT" : task.gate === "HUMAN_VALIDATION"
            ? "FUNCTIONAL_ACCEPTANCE" : task.gate === "HUMAN_APPROVAL" ? "HUMAN_APPROVAL" : "EXTERNAL_PROOF",
        repository: "sgwalton87/playbook-platform", commit: "abcdef1", artifact: `artifact:${taskId}`,
        acceptanceCriteria: task.acceptanceCriteria, approvalId: task.gate === "HUMAN_APPROVAL" ? "approval-1" : undefined,
        ...overrides };
};

describe("CIP-046 through CIP-050 Playbook launch plan", () => {
    it("covers every CIP with explicit evidence and approval gates", () => {
        const compiler = new PlaybookLaunchPlanCompiler();
        const plan = compiler.compile([]);
        expect(new Set(PLAYBOOK_LAUNCH_TASKS.map(task => task.cip))).toEqual(new Set(["CIP-046", "CIP-047", "CIP-048", "CIP-049", "CIP-050"]));
        expect(plan.readyForPublicLaunch).toBe(false);
        expect(plan.tasks.some(task => task.gate === "HUMAN_APPROVAL")).toBe(true);
        expect(plan.tasks.some(task => task.gate === "EXTERNAL_ACCOUNT")).toBe(true);
    });

    it("never unlocks dependent launch work from invalid evidence", () => {
        const plan = new PlaybookLaunchPlanCompiler().compile([
            proof("048-repository-gap-analysis", { evidenceId: "invalid", valid: false })
        ]);
        expect(plan.tasks.find(task => task.taskId === "048-foundation")?.state).toBe("BLOCKED");
    });

    it("unlocks the next task only after its dependencies are proven", () => {
        const compiler = new PlaybookLaunchPlanCompiler();
        const plan = compiler.compile([
            proof("048-repository-gap-analysis", { evidenceId: "gap-report" })
        ]);
        expect(plan.tasks.find(task => task.taskId === "048-foundation")?.state).toBe("READY");
        expect(compiler.byCip(plan, "CIP-049")).toHaveLength(4);
        expect(compiler.byCip(plan, "CIP-050")).toHaveLength(3);
    });

    it("cannot certify connected product journeys from a generated integration layer alone", () => {
        const journeyIds = ["048-academic-journey", "048-opportunity-journey", "048-application-journey",
            "048-support-journey", "048-messaging-journey", "048-notification-journey"];
        const aggregate = PLAYBOOK_LAUNCH_TASKS.find(task => task.taskId === "048-product-journeys");
        expect(aggregate?.title).toContain("Certify");
        expect(aggregate?.dependencies).toEqual(journeyIds);
        const plan = new PlaybookLaunchPlanCompiler().compile([
            proof("048-scholar-slice", { evidenceId: "scholar" }),
            proof("048-academic-journey", { evidenceId: "academic" })
        ]);
        expect(plan.tasks.find(task => task.taskId === "048-product-journeys")?.state).toBe("BLOCKED");
        expect(plan.tasks.find(task => task.taskId === "049-mobile-foundation")?.state).toBe("BLOCKED");
    });

    it("does not treat a boolean green flag as functional or launch evidence", () => {
        const task = "048-foundation";
        const plan = new PlaybookLaunchPlanCompiler().compile([
            proof(task, { evidenceId: "green-only", acceptanceCriteria: [] })
        ]);
        expect(plan.tasks.find(item => item.taskId === task)?.state).not.toBe("COMPLETE");
    });
});
