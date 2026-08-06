import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository, OperatorIdentityService } from "../../genesis-state";
import { durableMissionApproval, ensureReadinessQueue, latestUnfinishedRuns, promptForMissionApproval, streamProductionTelemetry } from "../pbos-cli";
import { RemediationRun } from "../../validation-automation";
import { AutonomousBatchService } from "../../operator-continuity";
import { createPlaybookBlueprint } from "../../reference-systems";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRuntimeService } from "../../production-runtime";

class ApprovalIO {
    readonly output: string[] = [];
    constructor(private readonly answer: string) {}
    write(message: string): void { this.output.push(message); }
    prompt(_message: string): Promise<string> { return Promise.resolve(this.answer); }
    close(): void {}
}

describe("partner-ready CLI durable state", () => {
    it("persists the Bulletproof catalog independently of a process", () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-cli-")), "state.json");
        const first = new GenesisStateRepository(path);
        first.saveSystem({ systemId: "BULLETPROOF-SYSTEM-001", operatingSystemId: "BULLETPROOF-OS-001", name: "Bulletproof Beneficiary",
            domain: "Legacy Planning", repository: "vycoywalton/bulletproof-beneficiary-registry", defaultBranch: "main", status: "READY", capabilities: ["IDENTITY"] });
        expect(new GenesisStateRepository(path).systems()[0].systemId).toBe("BULLETPROOF-SYSTEM-001");
    });

    it("refreshes a durable public name without changing the stable system identity", () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-cli-")), "state.json");
        const state = new GenesisStateRepository(path);
        state.saveSystem({ systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "Playbook Platform",
            domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY", capabilities: ["WORKFLOWS"] });
        state.saveSystem({ systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
            domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY", capabilities: ["WORKFLOWS"] });
        expect(new GenesisStateRepository(path).systems()).toEqual([
            expect.objectContaining({ systemId: "PLAYBOOK-SYSTEM-001", name: "The Playbook" })
        ]);
    });

    it("resumes only the latest unfinished run per application", () => {
        const run = (runId: string, systemId: string, state: RemediationRun["state"], number = 1): RemediationRun => ({
            runId, systemId, state, headSha: "sha", attempt: 0, maximumAttempts: 5, evidence: [], blockers: [],
            updatedAt: new Date().toISOString(), pullRequest: { number, branch: `agent/${runId}`, repository: "example/app",
                url: `https://github.com/example/app/pull/${runId}` }
        });
        expect(latestUnfinishedRuns([
            run("old", "PLAYBOOK-SYSTEM-001", "REMEDIATION_REQUIRED", 48),
            run("latest", "PLAYBOOK-SYSTEM-001", "WAITING_FOR_CHECKS", 49),
            { ...run("certified", "BULLETPROOF-SYSTEM-001", "READY_FOR_CERTIFICATION"),
                evidence: [{ evidenceId: "check", name: "validate", state: "PASSED", collectedAt: new Date().toISOString() }] }
        ]).map(item => item.runId)).toEqual(["latest"]);
    });

    it("does not resurrect an older unfinished run after a newer PR is certified", () => {
        const base = { systemId: "PLAYBOOK-SYSTEM-001", headSha: "sha", attempt: 0, maximumAttempts: 5,
            evidence: [], blockers: [], updatedAt: new Date().toISOString() };
        const make = (runId: string, number: number, state: RemediationRun["state"]): RemediationRun => ({ ...base, runId, state,
            pullRequest: { number, branch: `agent/${runId}`, repository: "example/app", url: `https://github.com/example/app/pull/${number}` } });
        expect(latestUnfinishedRuns([
            make("pr-49", 49, "REMEDIATION_REQUIRED"),
            { ...make("pr-50", 50, "READY_FOR_CERTIFICATION"),
                evidence: [{ evidenceId: "check", name: "validate", state: "PASSED", collectedAt: new Date().toISOString() }] }
        ])).toEqual([]);
    });

    it("resumes a historical false-ready run that contains only skipped checks", () => {
        const run: RemediationRun = { runId: "false-ready", systemId: "PLAYBOOK-SYSTEM-001",
            state: "READY_FOR_CERTIFICATION", headSha: "abcdef1", attempt: 0, maximumAttempts: 5, blockers: [],
            evidence: [{ evidenceId: "archive", name: "archive", state: "SKIPPED", collectedAt: new Date().toISOString() }],
            updatedAt: new Date().toISOString(), pullRequest: { number: 54, branch: "agent/build",
                repository: "sgwalton87/playbook-platform", url: "https://github.com/sgwalton87/playbook-platform/pull/54" } };
        expect(latestUnfinishedRuns([run]).map(item => item.runId)).toEqual(["false-ready"]);
    });

    it("bootstraps the Playbook readiness queue from governed capability evidence", async () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-cli-")), "state.json");
        const state = new GenesisStateRepository(path);
        state.saveSystem({ systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
            domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY", capabilities: [] });
        const inspection = { repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            revision: "5dda9e7", inspectedAt: new Date(), files: [],
            findings: createPlaybookBlueprint().capabilities.map(capability => `CAPABILITY:${capability}:PRESENT`) };
        let inspections = 0;
        const gateway = { inspectRepository: async () => { inspections += 1; return inspection; } } as unknown as GitHubRepositoryGateway;
        const batches = new AutonomousBatchService(state);

        await ensureReadinessQueue({ state, batches, gateway });
        await ensureReadinessQueue({ state, batches, gateway });

        expect(inspections).toBe(1);
        expect(state.missionQueue("PLAYBOOK-SYSTEM-001").find(item => item.missionId === "048-repository-gap-analysis")?.status)
            .toBe("ELIGIBLE");
        expect(state.missionQueue("PLAYBOOK-SYSTEM-001").find(item => item.missionId === "048-academic-journey")?.dependencies)
            .toEqual(["048-scholar-slice"]);
        expect(state.missionQueue("PLAYBOOK-SYSTEM-001").find(item => item.missionId === "048-product-journeys")?.status)
            .toBe("BLOCKED");
    });

    it("prompts for the next human-gated mission and persists a verifiable decision", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-cli-approval-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        const identities = new OperatorIdentityService(join(root, "operators.json"));
        const enrolled = identities.enroll("PBOS-ORG-001", "Founder");
        const operator = identities.authenticate(enrolled.operator.operatorId, enrolled.credential);
        const mission = { missionId: "048-foundation", systemId: "PLAYBOOK-SYSTEM-001", title: "Complete web foundations",
            dependencies: [], status: "ELIGIBLE" as const,
            rationale: "All declared dependencies are complete.", approvalRequired: true, evidenceIds: [] };
        state.saveMissionQueue([mission], mission.systemId);
        const io = new ApprovalIO("yes");

        const approval = await promptForMissionApproval(io,
            { state, identities, operator }, mission);

        expect(approval && identities.verify(approval, "START_PRODUCTION_MISSION", mission.missionId)).toBe(true);
        expect(state.audit().at(-1)).toMatchObject({ type: "VERIFIABLE_APPROVAL", resource: mission.missionId });
        expect(state.missionQueue(mission.systemId)[0].evidenceIds).toContain(`approval:${approval?.approvalId}`);
        expect(durableMissionApproval({ state, identities, operator }, mission)?.approvalId).toBe(approval?.approvalId);
        expect(io.output).toContain("PBOS APPROVAL CHECKPOINT");
        expect(io.output).toContain("MISSION AUTHORIZED");
        expect(io.output.join("\n")).toContain("Protected actions remain excluded");
    });

    it("keeps the mission queued without mutation when approval is declined", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-cli-decline-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        const identities = new OperatorIdentityService(join(root, "operators.json"));
        const enrolled = identities.enroll("PBOS-ORG-001", "Founder");
        const operator = identities.authenticate(enrolled.operator.operatorId, enrolled.credential);
        const mission = { missionId: "048-foundation", systemId: "PLAYBOOK-SYSTEM-001", title: "Complete web foundations",
            dependencies: [], status: "ELIGIBLE" as const, rationale: "Ready.", approvalRequired: true, evidenceIds: [] };
        state.saveMissionQueue([mission], mission.systemId);
        const io = new ApprovalIO("no");

        expect(await promptForMissionApproval(io,
            { state, identities, operator }, mission)).toBeUndefined();
        expect(state.audit()).toHaveLength(0);
        expect(state.missionQueue(mission.systemId)[0]).toMatchObject({ status: "ELIGIBLE", evidenceIds: [] });
        expect(io.output).toContain("MISSION NOT AUTHORIZED");
    });

    it("keeps same-terminal telemetry attached until validation reaches human approval", async () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-cli-telemetry-")), "state.json"));
        const production = new ProductionRuntimeService(state);
        const run = production.begin({ systemId: "PLAYBOOK-SYSTEM-001", actorId: "operator", authorizationArtifactId: "approval",
            repository: "sgwalton87/playbook-platform", branch: "agent/foundation", commit: "abcdef1",
            objective: "Foundation", mission: "Foundation", rationale: "Ready" });
        production.transition(run.runId, "QUEUED", "Queued");
        production.transition(run.runId, "STARTING", "Starting");
        production.transition(run.runId, "RUNNING", "Running");
        production.transition(run.runId, "VALIDATING", "Validating");
        production.transition(run.runId, "AWAITING_APPROVAL", "Ready for approval");
        const output: string[] = [];
        const result = await streamProductionTelemetry(state, run.runId, message => output.push(message), async () => undefined, 0, 1);
        expect(result).toBe("AWAITING_APPROVAL");
        expect(output.some(line => line.includes("HUMAN APPROVAL REQUIRED"))).toBe(true);
        expect(output.some(line => line.includes("RUN_AWAITING_APPROVAL"))).toBe(true);
    });

    it("prints the governed failure reason instead of hiding it behind a generic blocked state", async () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-cli-failure-telemetry-")), "state.json"));
        const production = new ProductionRuntimeService(state);
        const run = production.begin({ systemId: "PLAYBOOK-SYSTEM-001", actorId: "operator", authorizationArtifactId: "approval",
            repository: "sgwalton87/playbook-platform", branch: "agent/scholar", commit: "abcdef1",
            objective: "Scholar", mission: "Scholar", rationale: "Ready" });
        production.transition(run.runId, "QUEUED", "Queued");
        production.transition(run.runId, "STARTING", "Starting");
        production.transition(run.runId, "RUNNING", "Running");
        production.transition(run.runId, "VALIDATING", "Validating");
        const stage = production.startStage(run.runId, "APPLICATION_LAUNCH", "Launch Scholar");
        production.failStage(stage.stageId, "Application exited: next command not found");
        production.transition(run.runId, "BLOCKED", "Application launch failed", { reason: "next command not found" });
        const output: string[] = [];
        const result = await streamProductionTelemetry(state, run.runId, message => output.push(message), async () => undefined, 0, 1);
        expect(result).toBe("BLOCKED");
        expect(output.some(line => line.includes("next command not found"))).toBe(true);
    });
});
