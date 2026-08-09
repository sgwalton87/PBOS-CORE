import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { AutonomousProductionKernel } from "../index";
import { ApplicationAcceptanceEvidence, FunctionalAcceptancePlan, FunctionalApplicationRuntime,
    FunctionalRuntimeResult, ProductionRuntimeService } from "../../production-runtime";

const repository = "sgwalton87/playbook-platform";
const commit = "abcdef1";
const plan: FunctionalAcceptancePlan = { planId: "plan", systemId: "PLAYBOOK-SYSTEM-001", productNodeId: "SCHOLAR-ONBOARDING",
    journeyId: "SCHOLAR-ONBOARDING-TO-DASHBOARD", repository, branch: "agent/acceptance", commit, workingDirectory: "/tmp/playbook",
    launch: { command: "npm", args: ["start"], baseUrl: "http://127.0.0.1:4311", healthPath: "/healthz", startupTimeoutMs: 10_000 },
    probes: [{ probeId: "route", dimension: "ROUTE", behavior: "Route works", path: "/start", expectedStatus: 200 }],
    browserJourneys: [{ journeyId: "scholar", persona: "SCHOLAR", behavior: "Scholar journey works", route: "/start", engine: "PLAYWRIGHT",
        command: { command: "npx", args: ["playwright", "test"] }, viewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
        screenshotArtifacts: ["scholar-desktop.png", "scholar-mobile.png"], traceArtifact: "scholar.zip",
        accessibilityArtifact: "scholar-a11y.json", acceptanceArtifact: "scholar-acceptance.json",
        verifiedDimensions: ["DURABLE_DATA", "PBOS_INTEGRATION"] }] };

const evidence = (dimension: ApplicationAcceptanceEvidence["dimension"], source: ApplicationAcceptanceEvidence["source"]): ApplicationAcceptanceEvidence => ({
    evidenceId: `${dimension}-evidence`, dimension, behavior: `${dimension} works`, repository, commit, artifact: `${dimension}.json`, passed: true, source
});

const result: FunctionalRuntimeResult = { probes: [], journeys: [], nativeJourneys: [], applicationLogs: "ready",
    evidence: [evidence("ROUTE", "RUNTIME_PROBE"), evidence("USER_INTERFACE", "BROWSER_JOURNEY"),
        evidence("DURABLE_DATA", "RUNTIME_PROBE"), evidence("AUTHORITY", "SECURITY_TEST"),
        evidence("PBOS_INTEGRATION", "RUNTIME_PROBE"), evidence("ACCEPTANCE_TEST", "BROWSER_JOURNEY"),
        evidence("ACCESSIBILITY", "ACCESSIBILITY_AUDIT"), evidence("SECURITY", "SECURITY_TEST"), evidence("PREVIEW", "PREVIEW_PROBE")],
    preview: { previewId: "preview", runId: "run", repository, branch: plan.branch, commit, status: "READY",
        webUrl: plan.launch.baseUrl, routes: ["/start"], personas: ["SCHOLAR"], viewports: ["DESKTOP_1440X900"],
        screenshots: ["scholar.png"], generatedAt: new Date().toISOString(), label: "LIVE" } };

function fixture(application: Pick<FunctionalApplicationRuntime, "execute"> = { execute: async (_runId, _plan, report) => {
    report?.("PREREQUISITES_VERIFIED", { total: 0 });
    report?.("APPLICATION_HEALTHY", { health: "HEALTHY" });
    report?.("RUNTIME_PROBES_VERIFIED", { probes: 5 });
    report?.("BROWSER_JOURNEYS_VERIFIED", { journeys: 1 });
    report?.("DURABLE_PREVIEW_VERIFIED", { preview: "READY" });
    return result;
} }, leaseTtlMs = 30_000, leaseHeartbeatIntervalMs = 10_000) {
    const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-kernel-acceptance-")), "state.json"));
    const production = new ProductionRuntimeService(state, leaseTtlMs);
    state.saveMissionQueue([{ missionId: "journey", systemId: plan.systemId, title: "Scholar journey", dependencies: [], status: "ACTIVE",
        rationale: "Highest functional impact", approvalRequired: true, evidenceIds: [], completionPolicy: { kind: "FUNCTIONAL_APPLICATION",
            requiredDimensions: ["ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION", "ACCEPTANCE_TEST",
                "ACCESSIBILITY", "SECURITY", "INDEPENDENT_VALIDATION", "PREVIEW"], acceptanceCriteria: ["A Scholar completes onboarding"] } }], plan.systemId);
    const run = production.begin({ runId: "run", systemId: plan.systemId, actorId: "operator", authorizationArtifactId: "approval",
        repository, branch: plan.branch, commit, objective: "Scholar journey", mission: "Scholar journey", rationale: "Highest functional impact" });
    production.transition(run.runId, "QUEUED", "Queued"); production.transition(run.runId, "STARTING", "Starting");
    production.transition(run.runId, "RUNNING", "Running"); production.transition(run.runId, "VALIDATING", "Validating");
    production.recordFunctionalAcceptancePlan(run.runId, plan);
    return { state, production, kernel: new AutonomousProductionKernel(state, production,
        application as FunctionalApplicationRuntime, leaseHeartbeatIntervalMs) };
}

describe("PBS-5000 autonomous production kernel", () => {
    it("is the only path that advances a functional mission to human certification readiness", async () => {
        const subject = fixture();
        expect(() => subject.production.transition("run", "AWAITING_APPROVAL", "green CI"))
            .toThrow("PBOS Kernel functional authority");
        const accepted = await subject.kernel.verifyApplication("run", evidence("INDEPENDENT_VALIDATION", "CI_VALIDATION"));
        expect(accepted.run.status).toBe("AWAITING_APPROVAL");
        expect(accepted.run.previewArtifactIds).toContain("preview");
        expect(subject.production.events("run").map(item => item.type)).toContain("ACCEPTANCE_EVIDENCE_RECORDED");
        expect(subject.state.productionStages("run").map(item => item.type)).toEqual(expect.arrayContaining([
            "PREREQUISITE", "APPLICATION_LAUNCH", "RUNTIME_VERIFICATION", "BROWSER_JOURNEY", "ACCEPTANCE", "PREVIEW"
        ]));
    });

    it("fails closed with a resumable mission blocker when executable acceptance fails", async () => {
        const subject = fixture({ execute: async () => { throw new Error("browser journey failed"); } });
        await expect(subject.kernel.verifyApplication("run", evidence("INDEPENDENT_VALIDATION", "CI_VALIDATION")))
            .rejects.toThrow("browser journey failed");
        expect(subject.production.run("run")?.status).toBe("BLOCKED");
        expect(subject.production.run("run")?.repairAttempts).toBe(1);
        expect(subject.production.events("run").find(item => item.type === "REPAIR_FAILED")?.payload.classification)
            .toBe("BROWSER_ACCEPTANCE_FAILURE");
        expect(subject.state.missionQueue(plan.systemId)[0]).toMatchObject({ status: "BLOCKED", blockedRunId: "run",
            executionBlocker: "browser journey failed" });
    });

    it("renews the production lease while a long functional command is still active", async () => {
        const subject = fixture({ execute: async (_runId, _plan, report) => {
            await new Promise(resolve => setTimeout(resolve, 40));
            report?.("PREREQUISITES_VERIFIED", { total: 1 });
            report?.("APPLICATION_HEALTHY", { health: "HEALTHY" });
            report?.("RUNTIME_PROBES_VERIFIED", { probes: 1 });
            report?.("BROWSER_JOURNEYS_VERIFIED", { journeys: 1 });
            report?.("DURABLE_PREVIEW_VERIFIED", { preview: "READY" });
            return result;
        } }, 15, 5);

        const verification = subject.kernel.verifyApplication("run", evidence("INDEPENDENT_VALIDATION", "CI_VALIDATION"));
        await new Promise(resolve => setTimeout(resolve, 25));

        expect(subject.production.recoverStaleRuns()).toEqual([]);
        expect((await verification).run.status).toBe("AWAITING_APPROVAL");
    });

    it("preserves the real failure and requests operator authority when the repair budget is exhausted", async () => {
        const subject = fixture({ execute: async () => {
            throw new Error("Functional runtime requires 1073741824 free bytes but only 1057464320 are available.");
        } });
        for (let attempt = 0; attempt < 5; attempt += 1) {
            subject.production.recordRepairAttempt("run", "RUNTIME_RESOURCE_FAILURE", "STARTED");
            subject.production.recordRepairAttempt("run", "RUNTIME_RESOURCE_FAILURE", "FAILED");
        }
        await expect(subject.kernel.verifyApplication("run", evidence("INDEPENDENT_VALIDATION", "CI_VALIDATION")))
            .rejects.toThrow(/free bytes[\s\S]*bounded repair budget exhausted/i);
        expect(subject.production.run("run")).toMatchObject({ status: "BLOCKED", repairAttempts: 5 });
        expect(subject.production.run("run")?.terminalSummary).toContain("free bytes");
        const blocked = [...subject.production.events("run")].reverse().find(item => item.type === "RUN_BLOCKED");
        expect(blocked?.payload).toMatchObject({ classification: "RUNTIME_RESOURCE_FAILURE", repairAttempts: 5,
            repairAttemptLimit: 5 });
    });
});
