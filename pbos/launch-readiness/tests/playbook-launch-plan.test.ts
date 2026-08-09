import { describe, expect, it } from "vitest";
import { PLAYBOOK_LAUNCH_TASKS, PlaybookLaunchPlanCompiler, playbookLaunchTaskDefinitions } from "../index";

const proof = (taskId: string, overrides: Partial<import("../index").LaunchEvidence> = {}): import("../index").LaunchEvidence => {
    const task = playbookLaunchTaskDefinitions().find(item => item.taskId === taskId)
        ?? PLAYBOOK_LAUNCH_TASKS.find(item => item.taskId === taskId)!;
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
        expect(new Set(plan.tasks.map(task => task.cip))).toEqual(new Set(["CIP-046", "CIP-047", "CIP-048", "CIP-049", "CIP-050"]));
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

    it("cannot certify the product from the former seven-journey aggregate", () => {
        const aggregate = playbookLaunchTaskDefinitions().find(task => task.taskId === "048-product-journeys");
        expect(aggregate?.title).toContain("Certify");
        expect(aggregate?.dependencies).toHaveLength(32);
        expect(aggregate?.dependencies).toEqual(expect.arrayContaining([
            "048-onboarding-scholar", "048-onboarding-community-partner",
            "048-os-scholar", "048-os-platform-admin"
        ]));
        const plan = new PlaybookLaunchPlanCompiler().compile([
            proof("048-onboarding-scholar", { evidenceId: "scholar-onboarding" }),
            proof("048-os-scholar", { evidenceId: "scholar-os" })
        ]);
        expect(plan.tasks.find(task => task.taskId === "048-product-journeys")?.state).toBe("BLOCKED");
        expect(plan.tasks.find(task => task.taskId === "049-mobile-foundation")?.state).toBe("BLOCKED");
    });

    it("requires dependency completion before a task can be marked complete", () => {
        const plan = new PlaybookLaunchPlanCompiler().compile([
            proof("048-web-staging", { evidenceId: "staging-evidence" })
        ]);
        expect(plan.tasks.find(task => task.taskId === "048-web-staging")?.state).toBe("BLOCKED");
        expect(plan.tasks.find(task => task.taskId === "048-web-staging")?.blockedBy)
            .toEqual(expect.arrayContaining(["048-product-journeys", "047-operations"]));
    });

    it("does not treat a boolean green flag as functional or launch evidence", () => {
        const task = "048-foundation";
        const plan = new PlaybookLaunchPlanCompiler().compile([
            proof(task, { evidenceId: "green-only", acceptanceCriteria: [] })
        ]);
        expect(plan.tasks.find(item => item.taskId === task)?.state).not.toBe("COMPLETE");
    });

    it("accepts CIP-050 isolation only as a PBOS-owned platform artifact", () => {
        const compiler = new PlaybookLaunchPlanCompiler();
        const functional = compiler.compile([proof("050-isolation")]);
        expect(functional.tasks.find(item => item.taskId === "050-isolation")?.evidenceIds).toEqual([]);
        const platform = compiler.compile([proof("050-isolation", { evidenceType: "PLATFORM_ARTIFACT" })]);
        expect(platform.tasks.find(item => item.taskId === "050-isolation")?.evidenceIds).toEqual(["evidence:050-isolation"]);
        expect(platform.tasks.find(item => item.taskId === "050-isolation")?.state).toBe("BLOCKED");
    });

    it("derives CIP-048 journey chain from canonical journey IDs when provided", () => {
        const compiler = new PlaybookLaunchPlanCompiler();
        const plan = compiler.compile([], { canon: {
            productJourneyIds: ["SCHOLAR-ONBOARDING-TO-DASHBOARD", "TRANSCRIPT-TO-ACADEMIC-READINESS", "READINESS-TO-OPPORTUNITY"]
        } });
        expect(plan.tasks.some(task => task.taskId === "048-application-journey")).toBe(false);
        expect(plan.tasks.find(task => task.taskId === "048-product-journeys")?.dependencies).toEqual([
            "048-scholar-slice",
            "048-academic-journey",
            "048-opportunity-journey"
        ]);
        expect(plan.tasks.find(task => task.taskId === "048-opportunity-journey")?.dependencies).toEqual([
            "048-academic-journey"
        ]);
        [
            "048-product-journeys",
            "048-web-staging",
            "049-mobile-foundation",
            "049-mobile-journeys",
            "049-store-readiness",
            "049-certification",
            "050-platform-evidence",
            "050-isolation",
            "050-certification"
        ].forEach(taskId => expect(plan.tasks.some(task => task.taskId === taskId)).toBe(true));
    });

    it("fails closed for unsupported canonical product journey IDs", () => {
        const compiler = new PlaybookLaunchPlanCompiler();
        expect(() => compiler.compile([], { canon: { productJourneyIds: ["UNSUPPORTED-JOURNEY"] } }))
            .toThrow("Unsupported canonical product journey");
    });
});
