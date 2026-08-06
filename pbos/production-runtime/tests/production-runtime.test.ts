import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { GovernedMissionQueue, GovernedPreviewPipeline, ProductionMissionRunner, ProductionRuntimeService, assertProductionTransition } from "../index";

const runtime = (clock = new Date("2026-08-05T00:00:00.000Z")) => {
    let now = clock;
    const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-production-")), "state.json"));
    return { state, runtime: new ProductionRuntimeService(state, 30_000, () => now), advance: (milliseconds: number) => {
        now = new Date(now.getTime() + milliseconds);
    } };
};

const input = { systemId: "PLAYBOOK-SYSTEM-001", actorId: "operator", authorizationArtifactId: "approval",
    repository: "sgwalton87/playbook-platform", branch: "agent/run", commit: "5dda9e7",
    objective: "Build The Playbook", mission: "Scholar journey", rationale: "First eligible mission",
    buildChannel: { channelId: "channel-1", systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001",
        connectorId: "PLAYBOOK-CONNECTOR-001", repository: "sgwalton87/playbook-platform",
        domainRegistrationIds: ["PLAYBOOK-SCHOLAR-REGISTRATION-001"] } } as const;

describe("canonical PBOS production runtime", () => {
    it("enforces transitions and persists timing, stages, events, heartbeat, and lease release", () => {
        const fixture = runtime();
        const run = fixture.runtime.begin(input);
        fixture.runtime.transition(run.runId, "QUEUED", "Queued");
        fixture.runtime.transition(run.runId, "STARTING", "Starting");
        fixture.runtime.transition(run.runId, "RUNNING", "Running");
        const stage = fixture.runtime.startStage(run.runId, "EXECUTION", "Implement journey");
        fixture.advance(2_500);
        const completed = fixture.runtime.completeStage(stage.stageId, { files: 3 }, ["evidence-1"]);
        fixture.runtime.transition(run.runId, "VALIDATING", "Validating");
        fixture.runtime.transition(run.runId, "AWAITING_APPROVAL", "Approval required");
        fixture.advance(500);
        const certified = fixture.runtime.transition(run.runId, "CERTIFIED", "Certified");

        expect(completed.durationMs).toBe(2_500);
        expect(certified.durationMs).toBe(3_000);
        expect(fixture.state.productionEvents(run.runId).map(event => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        expect(fixture.state.executionLeases().at(-1)?.status).toBe("RELEASED");
        expect(fixture.runtime.snapshot().status).toBe("IDLE");
    });

    it("rejects duplicate execution and classifies expired leases for recovery", () => {
        const fixture = runtime();
        const run = fixture.runtime.begin(input);
        expect(() => fixture.runtime.begin({ ...input, runId: "duplicate" })).toThrow(/already owned/);
        fixture.advance(30_001);
        expect(fixture.runtime.recoverStaleRuns().map(item => item.runId)).toEqual([run.runId]);
        expect(fixture.runtime.run(run.runId)?.status).toBe("RECOVERING");
    });

    it("resumes a paused validation checkpoint as validation rather than re-running engineering", () => {
        const fixture = runtime();
        const run = fixture.runtime.begin(input);
        fixture.runtime.transition(run.runId, "QUEUED", "Queued");
        fixture.runtime.transition(run.runId, "STARTING", "Starting");
        fixture.runtime.transition(run.runId, "RUNNING", "Running");
        fixture.runtime.transition(run.runId, "VALIDATING", "Validating");
        fixture.runtime.startStage(run.runId, "VALIDATION", "Await protected staging decision");
        fixture.runtime.pause(run.runId, input.actorId);
        expect(fixture.runtime.resume(run.runId, input.actorId).status).toBe("VALIDATING");
    });

    it("rejects invalid status transitions and mission dependency cycles", () => {
        expect(() => assertProductionTransition("AUTHORIZED", "CERTIFIED")).toThrow(/Invalid PBOS production transition/);
        const queue = new GovernedMissionQueue();
        expect(() => queue.reconcile([
            { missionId: "a", systemId: "s", title: "A", dependencies: ["b"], status: "QUEUED", rationale: "", approvalRequired: false, evidenceIds: [] },
            { missionId: "b", systemId: "s", title: "B", dependencies: ["a"], status: "QUEUED", rationale: "", approvalRequired: false, evidenceIds: [] }
        ])).toThrow(/cycle/);
    });

    it("does not select around an active or execution-blocked mission", () => {
        const queue = new GovernedMissionQueue();
        const later = { missionId: "later", systemId: "s", title: "Later", dependencies: [], status: "QUEUED" as const,
            rationale: "Ready", approvalRequired: false, evidenceIds: [] };
        expect(queue.next([{ ...later, missionId: "active", title: "Active", status: "ACTIVE" }, later])).toBeUndefined();
        expect(queue.next([{ ...later, missionId: "failed", title: "Failed", status: "BLOCKED",
            executionBlocker: "Runtime acceptance failed", blockedRunId: "run-1" }, later])).toBeUndefined();
    });

    it("rebinds the acceptance plan and clears stale evidence after deterministic remediation", () => {
        const fixture = runtime();
        fixture.runtime.reconcileQueue(input.systemId, [{ missionId: "functional", systemId: input.systemId,
            title: input.mission, dependencies: [], status: "ACTIVE", rationale: "Ready", approvalRequired: true,
            evidenceIds: [], completionPolicy: { kind: "FUNCTIONAL_APPLICATION", requiredDimensions: ["ROUTE"],
                acceptanceCriteria: ["A route works"] } }]);
        const run = fixture.runtime.begin(input);
        fixture.runtime.recordValidation(run.runId, "Monitor linked", true, 0, "remediation-run:validation-1");
        fixture.runtime.recordFunctionalAcceptancePlan(run.runId, { planId: "plan", systemId: input.systemId,
            productNodeId: "product", journeyId: "journey", repository: input.repository, branch: input.branch,
            commit: input.commit, workingDirectory: "/tmp/example", launch: { command: "npm", args: ["run", "dev"],
                baseUrl: "http://127.0.0.1:3000", healthPath: "/", startupTimeoutMs: 1_000 }, probes: [],
            browserJourneys: [{ journeyId: "journey", persona: "SCHOLAR", behavior: "Journey works", route: "/",
                engine: "PLAYWRIGHT", command: { command: "npm", args: ["test"],
                    publicEnvironment: { PBOS_ACCEPTANCE_COMMIT: input.commit } },
                viewports: ["DESKTOP_1440X900", "MOBILE_390X844"], screenshotArtifacts: ["desktop.png", "mobile.png"],
                traceArtifact: "trace.zip", accessibilityArtifact: "a11y.json", acceptanceArtifact: "acceptance.json",
                verifiedDimensions: ["DURABLE_DATA"] }] });
        fixture.runtime.recordAcceptanceEvidence(run.runId, [{ evidenceId: "old", dimension: "ROUTE", behavior: "Old route",
            repository: input.repository, commit: input.commit, artifact: "/", passed: true, source: "RUNTIME_PROBE" }]);
        const rebound = fixture.runtime.rebindRepositoryAfterRemediation(run.runId, "validation-1", "agent/remediated", "abcdef2");
        expect(rebound.currentCommit).toBe("abcdef2");
        expect(rebound.functionalAcceptancePlan).toMatchObject({ branch: "agent/remediated", commit: "abcdef2" });
        expect(rebound.functionalAcceptancePlan?.browserJourneys[0].command.publicEnvironment)
            .toMatchObject({ PBOS_ACCEPTANCE_COMMIT: "abcdef2" });
        expect(rebound.acceptanceEvidence).toEqual([]);
        expect(fixture.runtime.events(run.runId).at(-1)?.type).toBe("REMEDIATION_LINEAGE_REBOUND");
        fixture.state.saveProductionRun({ ...rebound, functionalAcceptancePlan: { ...rebound.functionalAcceptancePlan!,
            browserJourneys: rebound.functionalAcceptancePlan!.browserJourneys.map(journey => ({ ...journey,
                command: { ...journey.command, publicEnvironment: { ...journey.command.publicEnvironment,
                    PBOS_ACCEPTANCE_COMMIT: input.commit } } })) } });
        const normalized = fixture.runtime.normalizeFunctionalAcceptanceLineage(run.runId);
        expect(normalized.currentCommit).toBe("abcdef2");
        expect(normalized.functionalAcceptancePlan?.browserJourneys[0].command.publicEnvironment)
            .toMatchObject({ PBOS_ACCEPTANCE_COMMIT: "abcdef2" });
        expect(fixture.runtime.events(run.runId).at(-1)?.type).toBe("FUNCTIONAL_ACCEPTANCE_LINEAGE_NORMALIZED");
    });

    it("redacts secrets from structured event payloads", () => {
        const fixture = runtime(); const run = fixture.runtime.begin(input);
        fixture.runtime.transition(run.runId, "QUEUED", "Queued", { token: "should-not-leak", command: "authorization=Bearer-secret" });
        const event = fixture.runtime.events(run.runId).at(-1)!;
        expect(event.payload.token).toBe("[REDACTED]");
        expect(event.payload.command).toBe("authorization=[REDACTED]");
    });

    it("requires commit-bound web and mobile links before application delivery is ready", () => {
        const pipeline = new GovernedPreviewPipeline();
        const screenshotOnly = pipeline.compile({ runId: "run", repository: "sgwalton87/playbook-platform",
            branch: "agent/preview", commit: "5dda9e7", experienceChanging: true, routes: ["/dashboard"], personas: ["SCHOLAR"],
            screenshots: ["evidence/dashboard-mobile.png"], label: "SEEDED" });
        expect(screenshotOnly.status).toBe("REQUESTED");
        const preview = pipeline.compile({ runId: "run", repository: "sgwalton87/playbook-platform",
            branch: "agent/preview", commit: "5dda9e7", experienceChanging: true, routes: ["/dashboard"], personas: ["SCHOLAR"],
            webUrl: "https://playbook-preview.example.com", mobileUrl: "https://expo.dev/@playbook/preview", label: "LIVE" });
        expect(preview.status).toBe("READY");
        expect(preview.webUrl).toBe("https://playbook-preview.example.com");
        expect(preview.mobileUrl).toBe("https://expo.dev/@playbook/preview");
        expect(preview.viewports).toEqual(["DESKTOP_1440X900", "MOBILE_390X844"]);
        expect(preview.commit).toBe("5dda9e7");
        expect(() => new GovernedPreviewPipeline().compile({ ...preview, experienceChanging: true, commit: "latest" })).toThrow(/exact/);
    });

    it("executes an eligible automated mission and stops before the next human approval boundary", async () => {
        const fixture = runtime();
        fixture.runtime.reconcileQueue(input.systemId, [
            { missionId: "048-repository-gap-analysis", systemId: input.systemId, title: "Compile repository gaps",
                dependencies: [], status: "QUEUED", rationale: "Foundation is certified.", approvalRequired: false, evidenceIds: [] },
            { missionId: "048-foundation", systemId: input.systemId, title: "Complete foundations",
                dependencies: ["048-repository-gap-analysis"], status: "QUEUED", rationale: "", approvalRequired: true, evidenceIds: [] }
        ]);
        const sequence = await new ProductionMissionRunner(fixture.state, fixture.runtime).run({ ...input,
            authorizationArtifactId: "approval", autonomousContinuation: true }, mission =>
            mission.missionId === "048-repository-gap-analysis" ? async () => ({ outputs: { gaps: 12 },
                evidenceIds: ["readiness:5dda9e7"], validations: [{ name: "Gap analysis", passed: true,
                    durationMs: 25, evidenceId: "readiness:5dda9e7" }] }) : undefined);

        expect(sequence.stopReason).toBe("APPROVAL_REQUIRED");
        expect(sequence.runs).toHaveLength(1);
        expect(sequence.runs[0]).toMatchObject({ status: "COMPLETED", runType: "READINESS" });
        expect(fixture.state.productionEvents(sequence.runs[0].runId).some(event =>
            event.payload.buildChannelId === "channel-1" && event.payload.connectorId === "PLAYBOOK-CONNECTOR-001")).toBe(true);
        expect(fixture.state.missionQueue(input.systemId).map(mission => [mission.missionId, mission.status]))
            .toEqual([["048-repository-gap-analysis", "COMPLETE"], ["048-foundation", "ELIGIBLE"]]);
        expect(fixture.state.executionLeases().at(-1)?.status).toBe("RELEASED");
    });

    it("keeps a human-gated mission in validation while external checks are running", async () => {
        const fixture = runtime();
        fixture.runtime.reconcileQueue(input.systemId, [{ missionId: "048-foundation", systemId: input.systemId,
            title: "Complete foundations", dependencies: [], status: "QUEUED", rationale: "Approved gap analysis.",
            approvalRequired: true, evidenceIds: [] }]);
        const sequence = await new ProductionMissionRunner(fixture.state, fixture.runtime).run({ ...input,
            approvedMissionIds: ["048-foundation"] }, () => async () => ({ outputs: { pullRequest: 52 },
            evidenceIds: ["pull-request:52"], validations: [{ name: "PR created", passed: true, durationMs: 1, evidenceId: "pull-request:52" }],
            deferredValidation: { remediationRunId: "validation-048", pullRequestUrl: "https://github.com/example/app/pull/52" } }));
        expect(sequence.stopReason).toBe("VALIDATION_IN_PROGRESS");
        expect(sequence.runs.at(-1)?.status).toBe("VALIDATING");
        expect(sequence.runs.at(-1)?.evidenceIds).toContain("remediation-run:validation-048");
        expect(fixture.state.executionLeases().at(-1)?.status).toBe("ACTIVE");
    });

    it("refuses mission execution when the Genesis to PBOS v1 channel crosses repositories", async () => {
        const fixture = runtime();
        await expect(new ProductionMissionRunner(fixture.state, fixture.runtime).run({ ...input,
            buildChannel: { ...input.buildChannel, repository: "another/application" } }, () => async () => ({
            outputs: {}, evidenceIds: [], validations: []
        }))).rejects.toThrow("matching Genesis to PBOS v1 build channel");
        expect(fixture.state.productionRuns()).toHaveLength(0);
    });
});
