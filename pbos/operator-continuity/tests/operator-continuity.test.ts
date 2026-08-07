import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { GenesisWorkflowService } from "../../genesis-console";
import { RemediationRun, ResumableRemediationEngine } from "../../validation-automation";
import { AutonomousBatchService, BackgroundMonitor, GitMergedRevisionPositioner, OperatorMemoService } from "../index";
import { ProductionRuntimeService } from "../../production-runtime";
import { CommandRunner } from "../../platform";

const session = {
    sessionId: "session-1", activatedAt: new Date(),
    system: { systemId: "SYSTEM-001", operatingSystemId: "OS-001", name: "Example", domain: "Example",
        repository: "example/app", defaultBranch: "main", status: "READY" as const, capabilities: ["WORKFLOWS"] },
    grant: { grantId: "grant", systemId: "SYSTEM-001", repository: "example/app", branchPattern: "agent/*",
        mode: "DELEGATED_AUTONOMY" as const, allowedActions: ["READ_SYSTEM_STATUS" as const], deniedActions: [], maximumRisk: "LOW" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }
};
const run: RemediationRun = { runId: "run-1", systemId: "SYSTEM-001",
    pullRequest: { number: 1, repository: "example/app", branch: "agent/build", url: "https://github.com/example/app/pull/1" },
    headSha: "abcdef1", attempt: 1, maximumAttempts: 5, state: "READY_FOR_CERTIFICATION",
    evidence: [{ evidenceId: "check", name: "validate", state: "PASSED", collectedAt: new Date().toISOString() }],
    blockers: [], updatedAt: new Date().toISOString() };

describe("operator continuity", () => {
    it("positions a merged recovery on the exact default-branch revision before acceptance", async () => {
        const calls: { args: readonly string[]; cwd?: string }[] = [];
        const commands: CommandRunner = { async run(_command, args, cwd) {
            calls.push({ args, cwd });
            return { stdout: args[0] === "rev-parse" ? "abcdef2\n" : "", stderr: "" };
        } };

        await new GitMergedRevisionPositioner(commands).position("/tmp/example", "main", "abcdef2");

        expect(calls).toEqual([
            { args: ["fetch", "origin", "main"], cwd: "/tmp/example" },
            { args: ["merge-base", "--is-ancestor", "abcdef2", "origin/main"], cwd: "/tmp/example" },
            { args: ["switch", "--detach", "abcdef2"], cwd: "/tmp/example" },
            { args: ["rev-parse", "HEAD"], cwd: "/tmp/example" }
        ]);
    });

    it("writes a durable exit memo with status, pull request, and next action", () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-memo-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        state.appendBatchTelemetry({ eventId: "event", batchId: "batch", systemId: "SYSTEM-001", sessionId: session.sessionId,
            type: "WORK_PACKAGE_COMPLETED", workPackageId: "wp-1", title: "Identity section", detail: "Section completed.", occurredAt: new Date().toISOString() });
        state.saveAutonomousBatch({ batchId: "batch", systemId: "SYSTEM-001", sessionId: session.sessionId, planId: "plan", packageLimit: 10,
            workPackages: [{ workPackageId: "wp-1", title: "Identity section" }], branch: "agent/build", pullRequestUrl: run.pullRequest.url,
            runId: run.runId, state: "READY_FOR_CERTIFICATION", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        const memos = new OperatorMemoService(join(root, "memos"), state);
        const record = memos.write(session, run);
        const latest = memos.latest("SYSTEM-001");
        expect(record.state).toBe("READY_FOR_CERTIFICATION");
        expect(latest?.content).toContain("## Certification Readiness");
        expect(latest?.content).toContain(run.pullRequest.url);
        expect(latest?.content).toContain("## Build Telemetry");
        expect(latest?.content).toContain("WORK_PACKAGE_COMPLETED");
    });

    it("background monitor resumes persisted work and emits the certification memo", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-monitor-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        state.saveSession(session);
        const remediation = { resume: async () => run } as unknown as ResumableRemediationEngine;
        const workflows = { authorizeRemediation: () => undefined } as unknown as GenesisWorkflowService;
        const memos = new OperatorMemoService(join(root, "memos"), state);
        const notifications: string[] = [];
        await new BackgroundMonitor(state, remediation, workflows, memos, async () => undefined,
            new AutonomousBatchService(state), { notify: async (_title, message) => { notifications.push(message); } })
            .run(run.runId, session.sessionId, 0, 1);
        expect(memos.latest("SYSTEM-001")?.record.state).toBe("READY_FOR_CERTIFICATION");
        expect(notifications[0]).toContain("ready for certification");
    });

    it("reports an infrastructure wait without consuming application remediation authority", () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-infrastructure-memo-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        const memos = new OperatorMemoService(join(root, "memos"), state);
        const infrastructure: RemediationRun = { ...run, state: "WAITING_FOR_INFRASTRUCTURE", attempt: 0,
            infrastructureRetries: 1, maximumInfrastructureRetries: 3,
            blockers: ["GitHub Actions infrastructure wait 1/3. No application remediation was consumed."] };
        memos.write(session, infrastructure);
        expect(memos.latest("SYSTEM-001")?.content).toContain("GitHub Actions did not execute the validation job");
        expect(memos.latest("SYSTEM-001")?.content).toContain("No application remediation was consumed");
    });

    it("moves a deferred production mission to human approval when GitHub validation passes", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-production-monitor-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        state.saveSession(session);
        const production = new ProductionRuntimeService(state);
        const productionRun = production.begin({ systemId: "SYSTEM-001", actorId: "operator", authorizationArtifactId: "approval",
            repository: "example/app", branch: "agent/build", commit: "abcdef1", objective: "Foundation", mission: "Foundation", rationale: "Ready" });
        production.transition(productionRun.runId, "QUEUED", "Queued");
        production.transition(productionRun.runId, "STARTING", "Starting");
        production.transition(productionRun.runId, "RUNNING", "Running");
        const execution = production.startStage(productionRun.runId, "EXECUTION", "Build foundation");
        production.completeStage(execution.stageId, {}, ["pull-request:1"]);
        production.transition(productionRun.runId, "VALIDATING", "Validating");
        production.startStage(productionRun.runId, "VALIDATION", "Validate foundation");
        production.recordValidation(productionRun.runId, "Validation monitor started", true, 0, "remediation-run:run-1");
        const remediation = { resume: async () => run } as unknown as ResumableRemediationEngine;
        const workflows = { authorizeRemediation: () => undefined } as unknown as GenesisWorkflowService;
        await new BackgroundMonitor(state, remediation, workflows, new OperatorMemoService(join(root, "memos"), state),
            async () => undefined, new AutonomousBatchService(state), { notify: async () => undefined })
            .run(run.runId, session.sessionId, 0, 1);
        expect(production.run(productionRun.runId)?.status).toBe("AWAITING_APPROVAL");
        expect(state.executionLeases().find(item => item.runId === productionRun.runId)?.status).toBe("RELEASED");
    });

    it("deploys an approved exact-revision preview after CI and before functional verification", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-preview-monitor-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        state.saveSession(session);
        state.appendAudit({ eventId: "preview-approval", type: "VERIFIABLE_APPROVAL", actorId: "operator",
            resource: "web-staging", occurredAt: new Date().toISOString(),
            evidence: { purpose: "START_PRODUCTION_MISSION" } });
        const production = new ProductionRuntimeService(state);
        production.reconcileQueue("SYSTEM-001", [{ missionId: "web-staging", systemId: "SYSTEM-001", title: "Web staging",
            dependencies: [], status: "ACTIVE", rationale: "Ready", approvalRequired: true, evidenceIds: [],
            completionPolicy: { kind: "FUNCTIONAL_APPLICATION", requiredDimensions: ["PREVIEW", "INDEPENDENT_VALIDATION"],
                acceptanceCriteria: ["Exact preview is healthy"] } }]);
        const active = production.begin({ systemId: "SYSTEM-001", actorId: "operator", authorizationArtifactId: "approval",
            repository: "example/app", branch: "agent/build", commit: "abcdef1", objective: "Web staging",
            mission: "Web staging", rationale: "Ready" });
        production.transition(active.runId, "QUEUED", "Queued"); production.transition(active.runId, "STARTING", "Starting");
        production.transition(active.runId, "RUNNING", "Running");
        const execution = production.startStage(active.runId, "EXECUTION", "Prepare staging");
        production.completeStage(execution.stageId, {}, []); production.transition(active.runId, "VALIDATING", "Validating");
        production.startStage(active.runId, "VALIDATION", "Validate staging");
        production.recordValidation(active.runId, "Validation monitor started", true, 0, "remediation-run:preview-validation");
        production.recordFunctionalAcceptancePlan(active.runId, { planId: "preview:abcdef1", systemId: "SYSTEM-001",
            productNodeId: "WEB", journeyId: "WEB-STAGING", repository: "example/app", branch: "agent/build", commit: "abcdef1",
            workingDirectory: root, launch: { command: "npm", args: ["run", "dev"], baseUrl: "http://127.0.0.1:4000",
                healthPath: "/login", startupTimeoutMs: 1 },
            probes: [{ probeId: "login", dimension: "ROUTE", behavior: "Login", path: "/login", expectedStatus: 200 }],
            browserJourneys: [{ journeyId: "web", persona: "USER", behavior: "Web opens", route: "/login", engine: "PLAYWRIGHT",
                command: { command: "npm", args: ["test"], publicEnvironment: { PLAYWRIGHT_BASE_URL: "http://127.0.0.1:4000" } },
                viewports: ["DESKTOP_1440X900", "MOBILE_390X844"], screenshotArtifacts: ["desktop.png", "mobile.png"],
                traceArtifact: "trace.zip", accessibilityArtifact: "a11y.json", acceptanceArtifact: "acceptance.json",
                verifiedDimensions: ["AUTHORITY"] }],
            previewDeployment: { provider: "VERCEL", repository: "example/app", branch: "agent/build", commit: "abcdef1",
                environment: "preview", approvalId: "preview-approval", tokenEnvironmentVariable: "VERCEL_TOKEN",
                projectEnvironmentVariable: "VERCEL_PROJECT_ID", requiredProjectEnvironmentVariables: ["PBOS_ENVIRONMENT"],
                previewOnlyEnvironmentVariables: ["PBOS_ENVIRONMENT"], browserTarget: "DEPLOYED_PREVIEW" } });
        const green: RemediationRun = { ...run, runId: "preview-validation", headSha: "abcdef1" };
        let verifiedUrl: string | undefined;
        const applicationVerifier = { verifyApplication: async (runId: string) => {
            verifiedUrl = new ProductionRuntimeService(state).run(runId)?.functionalAcceptancePlan?.durablePreview?.webUrl;
            return {} as never;
        } };
        await new BackgroundMonitor(state, { resume: async () => green } as unknown as ResumableRemediationEngine,
            { authorizeRemediation: () => undefined } as unknown as GenesisWorkflowService,
            new OperatorMemoService(join(root, "memos"), state), async () => undefined, new AutonomousBatchService(state),
            { notify: async () => undefined }, { deploy: async () => ({ webUrl: "https://preview.example",
                mobileUrl: "https://preview.example", healthPath: "/login", label: "SEEDED" }) }, applicationVerifier)
            .run(green.runId, session.sessionId, 0, 1);
        expect(verifiedUrl).toBe("https://preview.example");
        expect(production.run(active.runId)?.functionalAcceptancePlan?.browserJourneys[0]
            .command.publicEnvironment?.PLAYWRIGHT_BASE_URL).toBe("https://preview.example");
    });

    it("blocks a green PR when the application behavior evidence is missing", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-functional-monitor-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        state.saveSession(session);
        const production = new ProductionRuntimeService(state);
        production.reconcileQueue("SYSTEM-001", [{ missionId: "functional", systemId: "SYSTEM-001", title: "Functional journey",
            dependencies: [], status: "ACTIVE", rationale: "Ready", approvalRequired: true, evidenceIds: [],
            completionPolicy: { kind: "FUNCTIONAL_APPLICATION",
                requiredDimensions: ["ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION",
                    "ACCEPTANCE_TEST", "ACCESSIBILITY", "SECURITY", "INDEPENDENT_VALIDATION"],
                acceptanceCriteria: ["A real user completes the journey"] } }]);
        const productionRun = production.begin({ systemId: "SYSTEM-001", actorId: "operator", authorizationArtifactId: "approval",
            repository: "example/app", branch: "agent/build", commit: "abcdef1", objective: "Functional journey",
            mission: "Functional journey", rationale: "Ready" });
        production.transition(productionRun.runId, "QUEUED", "Queued");
        production.transition(productionRun.runId, "STARTING", "Starting");
        production.transition(productionRun.runId, "RUNNING", "Running");
        const execution = production.startStage(productionRun.runId, "EXECUTION", "Build journey");
        production.completeStage(execution.stageId, {}, ["pull-request:1"]);
        production.transition(productionRun.runId, "VALIDATING", "Validating");
        production.startStage(productionRun.runId, "VALIDATION", "Validate journey");
        production.recordValidation(productionRun.runId, "Validation monitor started", true, 0, "remediation-run:functional-run");
        const result: RemediationRun = { ...run, runId: "functional-run", headSha: "abcdef1",
            evidence: [{ evidenceId: "check", name: "validate", state: "PASSED", collectedAt: new Date().toISOString() }] };
        const remediation = { resume: async () => result } as unknown as ResumableRemediationEngine;
        const workflows = { authorizeRemediation: () => undefined } as unknown as GenesisWorkflowService;
        await expect(new BackgroundMonitor(state, remediation, workflows, new OperatorMemoService(join(root, "memos"), state),
            async () => undefined, new AutonomousBatchService(state), { notify: async () => undefined })
            .run(result.runId, session.sessionId, 0, 1)).rejects.toThrow("no executable functional acceptance plan");
        expect(production.run(productionRun.runId)?.status).toBe("BLOCKED");
    });

    it("keeps the same functional run blocked until a replacement revision passes independent validation", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-functional-recovery-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        state.saveSession(session);
        const production = new ProductionRuntimeService(state);
        production.reconcileQueue("SYSTEM-001", [{ missionId: "functional", systemId: "SYSTEM-001", title: "Functional journey",
            dependencies: [], status: "ACTIVE", rationale: "Ready", approvalRequired: true, evidenceIds: [],
            completionPolicy: { kind: "FUNCTIONAL_APPLICATION", requiredDimensions: ["INDEPENDENT_VALIDATION"],
                acceptanceCriteria: ["Independent validation passes"] } }]);
        const productionRun = production.begin({ systemId: "SYSTEM-001", actorId: "operator", authorizationArtifactId: "approval",
            repository: "example/app", branch: "agent/build", commit: "abcdef1", objective: "Functional journey",
            mission: "Functional journey", rationale: "Ready" });
        production.transition(productionRun.runId, "QUEUED", "Queued");
        production.transition(productionRun.runId, "STARTING", "Starting");
        production.transition(productionRun.runId, "RUNNING", "Running");
        production.transition(productionRun.runId, "VALIDATING", "Validating");
        const validation = production.startStage(productionRun.runId, "VALIDATION", "Validate journey");
        production.recordValidation(productionRun.runId, "Validation monitor started", true, 0, "remediation-run:run-1");
        production.completeStage(validation.stageId, { validation: "BLOCKED" });
        production.transition(productionRun.runId, "BLOCKED", "Functional acceptance blocked", {
            reason: "Functional completion requires at least one independent application check on the exact revision."
        });
        const waiting: RemediationRun = { ...run, state: "WAITING_FOR_CHECKS",
            evidence: [{ evidenceId: "skipped", name: "archive", state: "SKIPPED", collectedAt: new Date().toISOString() }] };
        const remediation = { resume: async () => waiting } as unknown as ResumableRemediationEngine;
        const workflows = { authorizeRemediation: () => undefined } as unknown as GenesisWorkflowService;
        await expect(new BackgroundMonitor(state, remediation, workflows, new OperatorMemoService(join(root, "memos"), state),
            async () => undefined, new AutonomousBatchService(state), { notify: async () => undefined })
            .run(waiting.runId, session.sessionId, 0, 1)).rejects.toThrow("polling limit");
        expect(production.run(productionRun.runId)?.status).toBe("BLOCKED");
        expect(production.run(productionRun.runId)?.terminalSummary).toBe("Functional acceptance blocked");
        expect(state.productionStages(productionRun.runId).at(-1)?.title).toBe("Validate journey");
    });
});
