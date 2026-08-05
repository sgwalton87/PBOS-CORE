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
    objective: "Build The Playbook", mission: "Scholar journey", rationale: "First eligible mission" } as const;

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

    it("rejects invalid status transitions and mission dependency cycles", () => {
        expect(() => assertProductionTransition("AUTHORIZED", "CERTIFIED")).toThrow(/Invalid PBOS production transition/);
        const queue = new GovernedMissionQueue();
        expect(() => queue.reconcile([
            { missionId: "a", systemId: "s", title: "A", dependencies: ["b"], status: "QUEUED", rationale: "", approvalRequired: false, evidenceIds: [] },
            { missionId: "b", systemId: "s", title: "B", dependencies: ["a"], status: "QUEUED", rationale: "", approvalRequired: false, evidenceIds: [] }
        ])).toThrow(/cycle/);
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
});
