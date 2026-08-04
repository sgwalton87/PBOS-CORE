import { describe, expect, it } from "vitest";
import { GenesisControlPlane } from "../genesis-control-plane";
import { GenesisSystemCatalog } from "../system-catalog";
import { GenesisTerminal } from "../genesis-terminal";
import { REFERENCE_SYSTEMS } from "../system-definition";
import { TerminalIO } from "../terminal-io";
import { GenesisWorkflowService } from "../genesis-workflow-service";
import { ResumableRemediationEngine, RemediationRun } from "../../validation-automation";

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
        const io = new FakeTerminal(["1", "2", "3", "y", "1", "2", "3", "4"]);
        const pullRequest = { number: 1, branch: "agent/build", repository: "vycoywalton/bulletproof-beneficiary-registry",
            url: "https://github.com/vycoywalton/bulletproof-beneficiary-registry/pull/1" };
        const run: RemediationRun = { runId: "validation-run", systemId: "BULLETPROOF-SYSTEM-001", pullRequest,
            headSha: "sha", attempt: 0, maximumAttempts: 5, state: "READY_FOR_CERTIFICATION", evidence: [], blockers: [], updatedAt: new Date().toISOString() };
        const workflows = {
            inspectAndPlan: async () => ({ planId: "plan-1", status: "READY_FOR_APPROVAL", workPackages: [{ id: "work-1" }] }),
            prepareDraftBuild: async () => ({ branch: pullRequest.branch, pullRequest, plan: {} }),
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
});
