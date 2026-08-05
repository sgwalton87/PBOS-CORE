import { describe, expect, it } from "vitest";
import { GenesisControlPlane } from "../genesis-control-plane";
import { GenesisSystemCatalog } from "../system-catalog";
import { GenesisTerminal } from "../genesis-terminal";
import { REFERENCE_SYSTEMS } from "../system-definition";
import { TerminalIO } from "../terminal-io";
import { GenesisWorkflowService } from "../genesis-workflow-service";
import { ResumableRemediationEngine, RemediationRun } from "../../validation-automation";
import { AutonomousBatchService, OperatorContinuityService } from "../../operator-continuity";
import { createPlaybookBlueprint } from "../../reference-systems";

class FakeTerminal implements TerminalIO {
    readonly output: string[] = [];
    private index = 0;

    constructor(private readonly answers: readonly string[]) {}
    write(message: string): void { this.output.push(message); }
    prompt(_message: string): Promise<string> { return Promise.resolve(this.answers[this.index++] ?? ""); }
    close(): void {}
}

describe("Genesis terminal control plane", () => {
    it("registers Playbook and Bulletproof as independent selectable systems", () => {
        const control = new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS));
        expect(control.listSystems().map(system => system.systemId)).toEqual([
            "PLAYBOOK-SYSTEM-001", "BULLETPROOF-SYSTEM-001"
        ]);
        expect(control.listSystems()[0].repository).not.toBe(control.listSystems()[1].repository);
    });

    it("activates Playbook with delegated autonomous build authority", async () => {
        const io = new FakeTerminal(["1", "1", "3", "yes"]);
        const terminal = new GenesisTerminal(
            new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS)), io
        );
        expect(await terminal.run()).toBe(0);
        expect(io.output).toContain("Authority: Delegated Autonomous Build");
        expect(io.output).toContain("Batch scope: selected after repository planning (maximum 10)");
        expect(io.output).toContain("Build session active.");
    });

    it("supports Bulletproof selection without activating Playbook", async () => {
        const io = new FakeTerminal(["1", "2", "1", "y"]);
        const terminal = new GenesisTerminal(
            new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS)), io
        );
        expect(await terminal.run()).toBe(0);
        expect(io.output).toContain("System: Bulletproof Beneficiary");
        expect(io.output).toContain("Authority: Read Only");
    });

    it("preselects The Playbook while preserving authority approval", async () => {
        const io = new FakeTerminal(["3", "yes"]);
        const terminal = new GenesisTerminal(new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS)), io);
        expect(await terminal.run("PLAYBOOK-SYSTEM-001")).toBe(0);
        expect(io.output).toContain("DIRECT APPLICATION BUILD");
        expect(io.output).toContain("Selected application: The Playbook");
        expect(io.output).toContain("The application-selection step has been skipped by the command shortcut.\n");
        expect(io.output).toContain("System: The Playbook");
        expect(io.output).toContain("Authority: Delegated Autonomous Build");
    });

    it("creates an enforceable grant for the selected system", () => {
        const control = new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS));
        const session = control.activateSystem(
            "PLAYBOOK-SYSTEM-001", "DELEGATED_AUTONOMY", "operator", "session-approval"
        );
        expect(control.authorizeAction(
            session.sessionId, "MODIFY_APPLICATION_CODE", "MEDIUM", "agent/scholar-onboarding"
        ).allowed).toBe(true);
        expect(control.authorizeAction(
            session.sessionId, "MODIFY_APPLICATION_CODE", "MEDIUM", "main"
        ).allowed).toBe(false);
    });

    it("guides the operator through plan, build, validation, and explicit exit in one launch", async () => {
        const io = new FakeTerminal(["1", "2", "2", "y", "1", "2", "3", "4"]);
        const pullRequest = { number: 1, branch: "agent/build", repository: "vycoywalton/bulletproof-beneficiary-registry",
            url: "https://github.com/vycoywalton/bulletproof-beneficiary-registry/pull/1" };
        const run: RemediationRun = { runId: "validation-run", systemId: "BULLETPROOF-SYSTEM-001", pullRequest,
            headSha: "sha", attempt: 0, maximumAttempts: 5, state: "READY_FOR_CERTIFICATION", evidence: [], blockers: [], updatedAt: new Date().toISOString() };
        const workflows = {
            inspectAndPlan: async () => ({ planId: "plan-1", status: "READY_FOR_APPROVAL", workPackages: [{ id: "work-1" }] }),
            prepareDraftBuild: async () => ({ branch: pullRequest.branch, pullRequest, plan: {}, workPackageCount: 1 }),
            authorizeRemediation: () => undefined
        } as unknown as GenesisWorkflowService;
        const remediation = {
            start: () => run,
            latest: () => run,
            resume: async () => run
        } as unknown as ResumableRemediationEngine;
        const terminal = new GenesisTerminal(new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS)), io,
            undefined, undefined, workflows, remediation);
        expect(await terminal.run()).toBe(0);
        expect(io.output).toContain("Plan: plan-1");
        expect(io.output).toContain(`Draft PR: ${pullRequest.url}`);
        expect(io.output).toContain("Certification memo is ready for human approval.");
        expect(io.output.filter(line => line === "1. Inspect repository and create build plan")).toHaveLength(4);
    });

    it("shows the exact remaining packages and recommends one clear autonomous batch", async () => {
        const io = new FakeTerminal(["1", "1", "3", "y", "", ""]);
        const pullRequest = { number: 50, branch: "agent/batch", repository: "sgwalton87/playbook-platform",
            url: "https://github.com/sgwalton87/playbook-platform/pull/50" };
        const workPackages = Array.from({ length: 7 }, (_, index) => ({ id: `wp-${index + 1}`, title: `Section ${index + 1}` }));
        const blueprint = createPlaybookBlueprint();
        const plan = { planId: "plan", status: "READY_FOR_APPROVAL", blockers: [], workPackages, blueprint,
            inspection: { findings: [], revision: "revision", repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, inspectedAt: new Date() } };
        const workflows = {
            inspectAndPlan: async () => plan,
            prepareDraftBuild: async () => ({ branch: pullRequest.branch, pullRequest, plan, workPackageCount: 7, batchId: "batch" })
        } as unknown as GenesisWorkflowService;
        const run = { runId: "run", systemId: "PLAYBOOK-SYSTEM-001", pullRequest, headSha: "sha", attempt: 0, maximumAttempts: 5,
            state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() } as RemediationRun;
        const remediation = { start: () => run, latest: () => undefined } as unknown as ResumableRemediationEngine;
        const continuity = {
            launchBackground: () => ({ pid: 42, logPath: "/tmp/pbos.log" }),
            summarize: () => ({ run, lines: [] })
        } as unknown as OperatorContinuityService;
        const terminal = new GenesisTerminal(new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS)), io,
            undefined, undefined, workflows, remediation, continuity);
        expect(await terminal.run()).toBe(0);
        expect(io.output).toContain("7 incomplete work packages discovered.");
        expect(io.output).toContain("3. Build all 7 remaining work packages (Recommended)");
        expect(io.output).toContain("Selected batch: 7 work packages");
        expect(io.output).toContain("Remaining after this batch: 0 work packages");
        expect(io.output).toContain("NEXT HUMAN STEP: Wait for the PBOS notification, then review the certification memo. No repeated terminal selections are required.");
    });

    it("refuses a duplicate build while an autonomous package batch is active", async () => {
        const io = new FakeTerminal(["1", "1", "3", "y"]);
        const workflows = { inspectAndPlan: async () => { throw new Error("planner must not run"); } } as unknown as GenesisWorkflowService;
        const continuity = {
            launchBackground: () => ({ pid: 42, logPath: "/tmp/existing.log" }),
            summarize: () => ({ lines: [] })
        } as unknown as OperatorContinuityService;
        const batches = ({ latest: () => ({ batchId: "batch-active", state: "VALIDATING",
            pullRequestUrl: "https://github.com/example/app/pull/1" }) }) as unknown as AutonomousBatchService;
        const terminal = new GenesisTerminal(new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS)), io,
            undefined, undefined, workflows, undefined, continuity, batches);
        expect(await terminal.run()).toBe(0);
        expect(io.output).toContain("EXISTING AUTONOMOUS BATCH DETECTED");
        expect(io.output).toContain("PBOS will not create a duplicate batch while this package set remains active.");
    });

    it("requires a green batch to be certified and merged before selecting the next package", async () => {
        const io = new FakeTerminal(["1", "1", "3", "y"]);
        const blueprint = createPlaybookBlueprint();
        const workPackage = { id: "PLAYBOOK-SYSTEM-001:IDENTITY", title: "Implement identity" };
        const workflows = { inspectAndPlan: async () => ({ planId: "next", status: "READY_FOR_APPROVAL", blockers: [],
            workPackages: [workPackage], blueprint, inspection: { findings: [], revision: "main", repository: {
                owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, inspectedAt: new Date() } }) } as unknown as GenesisWorkflowService;
        const continuity = { summarize: () => ({ lines: [] }) } as unknown as OperatorContinuityService;
        const batches = ({ latest: () => ({ batchId: "batch-green", state: "READY_FOR_CERTIFICATION",
            pullRequestUrl: "https://github.com/example/app/pull/1",
            workPackages: [{ workPackageId: workPackage.id, title: workPackage.title }] }) }) as unknown as AutonomousBatchService;
        const terminal = new GenesisTerminal(new GenesisControlPlane(new GenesisSystemCatalog(REFERENCE_SYSTEMS)), io,
            undefined, undefined, workflows, undefined, continuity, batches);
        expect(await terminal.run()).toBe(0);
        expect(io.output).toContain("PRIOR BATCH IS GREEN AND AWAITING HUMAN CERTIFICATION/MERGE");
        expect(io.output).toContain("NEXT HUMAN STEP: certify and merge the prior batch. PBOS will recognize it from the governed default branch on the next launch.");
    });
});
