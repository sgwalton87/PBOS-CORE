import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { ApplicationAcceptanceEvidence, FunctionalAcceptancePlan, GovernedMissionQueue, GovernedPreviewPipeline, ProductionMissionRunner, ProductionRecoveryAuthority,
    ProductionRuntimeService, assertProductionTransition } from "../index";

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

    it("resumes an interrupted browser checkpoint without consuming a repair attempt", () => {
        const fixture = runtime();
        const run = fixture.runtime.begin(input);
        fixture.runtime.transition(run.runId, "QUEUED", "Queued");
        fixture.runtime.transition(run.runId, "STARTING", "Starting");
        fixture.runtime.transition(run.runId, "RUNNING", "Running");
        fixture.runtime.transition(run.runId, "VALIDATING", "Validating");
        const interrupted = fixture.runtime.startStage(run.runId, "BROWSER_JOURNEY", "Run Scholar browser journey");
        fixture.advance(30_001);

        const recovered = fixture.runtime.recoverStaleRuns().at(-1)!;
        expect(recovered).toMatchObject({ runId: run.runId, status: "RECOVERING",
            activeStageId: undefined, resumeCheckpoint: "BROWSER_JOURNEY", repairAttempts: 0 });
        expect(fixture.state.productionStages(run.runId).find(stage => stage.stageId === interrupted.stageId))
            .toMatchObject({ status: "FAILED",
                error: "Execution was interrupted after its cross-process lease expired; no acceptance result was recorded." });

        const resumed = fixture.runtime.resume(run.runId, input.actorId);
        const active = fixture.state.productionStages(run.runId).find(stage => stage.stageId === resumed.activeStageId);
        expect(resumed).toMatchObject({ runId: run.runId, status: "VALIDATING", repairAttempts: 0 });
        expect(active).toMatchObject({ type: "VALIDATION", status: "RUNNING",
            inputs: { recoveryCheckpoint: "BROWSER_JOURNEY" } });
        expect(() => fixture.runtime.startStage(run.runId, "BROWSER_JOURNEY", "Duplicate browser journey"))
            .toThrow(/already has active stage/);
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

    it("recovers a failed adapter evidence checkpoint without creating a second mission or pull request", () => {
        const fixture = runtime();
        fixture.runtime.reconcileQueue(input.systemId, [{ missionId: "web-staging", systemId: input.systemId,
            title: input.mission, dependencies: [], status: "ACTIVE", rationale: "Existing functional mission",
            approvalRequired: true, evidenceIds: [], completionPolicy: { kind: "FUNCTIONAL_APPLICATION",
                requiredDimensions: ["ROUTE", "PREVIEW"], acceptanceCriteria: ["Preview works"] } }]);
        const run = fixture.runtime.begin(input);
        fixture.runtime.transition(run.runId, "QUEUED", "Queued");
        fixture.runtime.transition(run.runId, "STARTING", "Starting");
        fixture.runtime.transition(run.runId, "RUNNING", "Running");
        const stage = fixture.runtime.startStage(run.runId, "EXECUTION", input.mission);
        fixture.runtime.failStage(stage.stageId,
            "Functional mission web-staging is missing implementation acceptance evidence: PREVIEW.");
        fixture.runtime.transition(run.runId, "FAILED", "Mission execution failed.");
        fixture.state.saveRemediationRun({ runId: "validation-web", systemId: input.systemId,
            pullRequest: { url: "https://github.com/sgwalton87/playbook-platform/pull/67", number: 67,
                branch: input.branch, repository: input.repository }, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5,
            state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() });
        const evidence = (["ROUTE", "PREVIEW"] as const).map(dimension => ({
            evidenceId: `web:${dimension.toLowerCase()}:${input.commit}`, dimension, behavior: `${dimension} prepared`,
            repository: input.repository, commit: input.commit, artifact: "pbos/readiness/048-web-staging.json",
            passed: true, source: "IMPLEMENTATION" as const
        }));
        const plan: FunctionalAcceptancePlan = { planId: "web-plan", systemId: input.systemId,
            productNodeId: "web", journeyId: "web-staging", repository: input.repository, branch: input.branch,
            commit: input.commit, workingDirectory: "/tmp/playbook", prerequisites: [],
            launch: { command: "npm", args: ["run", "dev"], baseUrl: "http://127.0.0.1:4311", healthPath: "/",
                startupTimeoutMs: 1_000 }, probes: [], browserJourneys: [] };

        const recovered = fixture.runtime.recoverFailedFunctionalImplementationValidation(run.runId,
            "validation-web", evidence, plan);

        expect(recovered).toMatchObject({ status: "VALIDATING", currentBranch: input.branch,
            currentCommit: input.commit, functionalAcceptancePlan: { planId: "web-plan" } });
        expect(recovered.evidenceIds).toContain("remediation-run:validation-web");
        expect(fixture.state.productionRuns()).toHaveLength(1);
        expect(fixture.state.missionQueue(input.systemId)).toHaveLength(1);
    });

    it("creates an authorized recovery epoch without resetting attempts, replacing the mission, or discarding evidence", () => {
        const fixture = runtime();
        fixture.runtime.reconcileQueue(input.systemId, [{ missionId: "scholar-journey", systemId: input.systemId,
            title: input.mission, dependencies: [], status: "ACTIVE", rationale: "Existing governed mission",
            approvalRequired: true, evidenceIds: ["mission-evidence"] }]);
        const run = fixture.runtime.begin(input);
        fixture.runtime.transition(run.runId, "QUEUED", "Queued");
        fixture.runtime.transition(run.runId, "STARTING", "Starting");
        fixture.runtime.transition(run.runId, "RUNNING", "Running");
        fixture.runtime.transition(run.runId, "VALIDATING", "Validating");
        fixture.runtime.recordValidation(run.runId, "Monitor linked", true, 0, "remediation-run:validation-1");
        for (let attempt = 0; attempt < 5; attempt += 1) {
            fixture.runtime.recordRepairAttempt(run.runId, "BROWSER_ACCEPTANCE_FAILURE", "STARTED");
            fixture.runtime.recordRepairAttempt(run.runId, "BROWSER_ACCEPTANCE_FAILURE", "FAILED");
        }
        fixture.runtime.transition(run.runId, "BLOCKED", "Repair budget exhausted");
        expect(fixture.runtime.repairBudget(run.runId)).toEqual({ attempts: 5, limit: 5, remaining: 0 });
        expect(() => fixture.runtime.recoverBlockedValidation(run.runId, "validation-1", input.commit))
            .toThrow("verified operator approval");

        const authority = new ProductionRecoveryAuthority(fixture.state, fixture.runtime);
        const epoch = authority.request(run.runId);
        expect(epoch).toMatchObject({ epochNumber: 1, runId: run.runId, missionId: "scholar-journey",
            status: "AWAITING_AUTHORIZATION", repositoryState: { commit: input.commit },
            runtimeState: { repairAttempts: 5, repairAttemptLimit: 5 } });
        expect(epoch.attemptedRepairs).toHaveLength(5);
        expect(epoch.remainingDefects).toContain("Repair budget exhausted");
        expect(epoch.lineageEvidenceIds).toContain("remediation-run:validation-1");
        expect(fixture.state.missionQueue(input.systemId)).toHaveLength(1);
        expect(() => authority.authorize(epoch.recoveryEpochId, "repair-approval-1", input.actorId, () => false))
            .toThrow("explicit verifiable operator authorization");

        const active = authority.authorize(epoch.recoveryEpochId, "repair-approval-1", input.actorId,
            (approvalId, actorId, runId) => approvalId === "repair-approval-1" && actorId === input.actorId && runId === run.runId);
        const extended = fixture.runtime.run(run.runId)!;
        expect(active.status).toBe("ACTIVE");
        expect(extended.repairAttempts).toBe(5);
        expect(extended.repairExtensionApprovalIds).toEqual(["repair-approval-1"]);
        expect(extended.recoveryEpochIds).toEqual([epoch.recoveryEpochId]);
        expect(extended.activeRecoveryEpochId).toBe(epoch.recoveryEpochId);
        expect(extended.evidenceIds).toEqual(expect.arrayContaining([
            "remediation-run:validation-1", `recovery-epoch:${epoch.recoveryEpochId}`, "approval:repair-approval-1"
        ]));
        expect(fixture.runtime.repairBudget(run.runId)).toEqual({ attempts: 5, limit: 6, remaining: 1 });
        expect(() => authority.authorize(epoch.recoveryEpochId, "repair-approval-1", input.actorId, () => true))
            .toThrow(/explicit verifiable operator authorization/);
        expect(fixture.runtime.events(run.runId).at(-1)?.type).toBe("RECOVERY_AUTHORITY_GRANTED");

        const recovered = fixture.runtime.recoverBlockedValidation(run.runId, "validation-1", input.commit);
        const activeStage = fixture.state.productionStages(run.runId)
            .filter(stage => stage.status === "RUNNING");
        expect(recovered).toMatchObject({ runId: run.runId, selectedMission: input.mission,
            status: "VALIDATING", repairAttempts: 5, repairAttemptLimit: 6,
            activeRecoveryEpochId: epoch.recoveryEpochId });
        expect(activeStage).toHaveLength(1);
        expect(activeStage[0]).toMatchObject({ stageId: recovered.activeStageId, type: "VALIDATION",
            inputs: { recoveryCheckpoint: "VALIDATION" } });
    });

    it("attaches a governed recovery PR to the same functional run while preserving its authorized acceptance attempt", () => {
        const fixture = runtime();
        fixture.runtime.reconcileQueue(input.systemId, [{ missionId: "academic", systemId: input.systemId,
            title: input.mission, dependencies: [], status: "ACTIVE", rationale: "Existing functional mission",
            approvalRequired: true, evidenceIds: [], completionPolicy: { kind: "FUNCTIONAL_APPLICATION",
                requiredDimensions: ["ROUTE"], acceptanceCriteria: ["Academic route works"] } }]);
        const run = fixture.runtime.begin(input);
        fixture.runtime.recordFunctionalAcceptancePlan(run.runId, { planId: "academic-plan", systemId: input.systemId,
            productNodeId: "academic", journeyId: "academic-journey", repository: input.repository,
            branch: input.branch, commit: input.commit, workingDirectory: "/tmp/playbook", prerequisites: [],
            launch: { command: "npm", args: ["run", "dev"], baseUrl: "http://127.0.0.1:4311", healthPath: "/",
                startupTimeoutMs: 1_000 }, probes: [], browserJourneys: [] });
        fixture.runtime.transition(run.runId, "QUEUED", "Queued");
        fixture.runtime.transition(run.runId, "STARTING", "Starting");
        fixture.runtime.transition(run.runId, "RUNNING", "Running");
        fixture.runtime.transition(run.runId, "VALIDATING", "Validating");
        fixture.runtime.recordValidation(run.runId, "Original validation", true, 0, "remediation-run:original");
        for (let attempt = 0; attempt < 5; attempt += 1) {
            fixture.runtime.recordRepairAttempt(run.runId, "BROWSER_ACCEPTANCE_FAILURE", "STARTED");
            fixture.runtime.recordRepairAttempt(run.runId, "BROWSER_ACCEPTANCE_FAILURE", "FAILED");
        }
        fixture.runtime.transition(run.runId, "BLOCKED", "Idempotency key reused with a different request.");
        const authority = new ProductionRecoveryAuthority(fixture.state, fixture.runtime);
        const epoch = authority.request(run.runId);
        authority.authorize(epoch.recoveryEpochId, "recovery-approval", input.actorId, () => true);
        fixture.state.saveRemediationRun({ runId: "recovery-validation", systemId: input.systemId,
            pullRequest: { url: "https://github.com/sgwalton87/playbook-platform/pull/57", number: 57,
                branch: "agent/academic-recovery", repository: input.repository }, headSha: "UNKNOWN", attempt: 0,
            maximumAttempts: 5, state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() });

        const attached = fixture.runtime.registerRecoveryRemediation(run.runId, "recovery-validation",
            "agent/academic-recovery", "abcdef1", "ACADEMIC_PUBLICATION_IDEMPOTENCY_CONTRACT");

        expect(attached).toMatchObject({ runId: run.runId, status: "BLOCKED", currentBranch: "agent/academic-recovery",
            currentCommit: "abcdef1", repairAttempts: 5, repairAttemptLimit: 6,
            activeRecoveryEpochId: epoch.recoveryEpochId });
        expect(fixture.runtime.repairBudget(run.runId)).toEqual({ attempts: 5, limit: 6, remaining: 1 });
        expect(attached.evidenceIds).toContain("remediation-run:recovery-validation");
        expect(attached.functionalAcceptancePlan).toMatchObject({ branch: "agent/academic-recovery", commit: "abcdef1" });
        expect(fixture.runtime.events(run.runId).map(event => event.type)).toContain("RECOVERY_REMEDIATION_REGISTERED");
        expect(() => fixture.runtime.registerRecoveryRemediation(run.runId, "recovery-validation",
            "agent/academic-recovery", "abcdef1", "DUPLICATE")).toThrow("active authorized production epoch");
    });

    it("attaches a bounded deterministic repair without replacing the mission or pull request", () => {
        const fixture = runtime();
        fixture.runtime.reconcileQueue(input.systemId, [{ missionId: "opportunity", systemId: input.systemId,
            title: input.mission, dependencies: [], status: "ACTIVE", rationale: "Existing functional mission",
            approvalRequired: true, evidenceIds: [], completionPolicy: { kind: "FUNCTIONAL_APPLICATION",
                requiredDimensions: ["ROUTE"], acceptanceCriteria: ["Opportunity route works"] } }]);
        const run = fixture.runtime.begin(input);
        fixture.runtime.recordFunctionalAcceptancePlan(run.runId, { planId: "opportunity-plan", systemId: input.systemId,
            productNodeId: "opportunity", journeyId: "opportunity-journey", repository: input.repository,
            branch: input.branch, commit: input.commit, workingDirectory: "/tmp/playbook", prerequisites: [],
            launch: { command: "npm", args: ["run", "dev"], baseUrl: "http://127.0.0.1:4311", healthPath: "/",
                startupTimeoutMs: 1_000 }, probes: [], browserJourneys: [] });
        fixture.runtime.transition(run.runId, "QUEUED", "Queued");
        fixture.runtime.transition(run.runId, "STARTING", "Starting");
        fixture.runtime.transition(run.runId, "RUNNING", "Running");
        fixture.runtime.transition(run.runId, "VALIDATING", "Validating");
        fixture.runtime.recordRepairAttempt(run.runId, "FUNCTIONAL_ACCEPTANCE_FAILURE", "STARTED");
        fixture.runtime.recordRepairAttempt(run.runId, "FUNCTIONAL_ACCEPTANCE_FAILURE", "FAILED");
        fixture.runtime.transition(run.runId, "BLOCKED", "Identity mapping already registered");
        const pullRequest = { url: "https://github.com/sgwalton87/playbook-platform/pull/61", number: 61,
            branch: input.branch, repository: input.repository };
        fixture.state.saveRemediationRun({ runId: "bounded-validation", systemId: input.systemId, pullRequest,
            headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS", evidence: [],
            blockers: [], updatedAt: new Date().toISOString() });

        const attached = fixture.runtime.registerBoundedRemediation(run.runId, "bounded-validation",
            input.branch, "abcdef2", "OPPORTUNITY_IDENTITY_IDEMPOTENCY");

        expect(attached).toMatchObject({ runId: run.runId, selectedMission: input.mission, status: "BLOCKED",
            currentBranch: input.branch, currentCommit: "abcdef2", repairAttempts: 1, repairAttemptLimit: 5 });
        expect(attached.evidenceIds).toContain("remediation-run:bounded-validation");
        expect(attached.functionalAcceptancePlan).toMatchObject({ branch: input.branch, commit: "abcdef2" });
        expect(fixture.runtime.events(run.runId).map(event => event.type)).toEqual(expect.arrayContaining([
            "BOUNDED_REMEDIATION_REGISTERED", "REMEDIATION_LINEAGE_REBOUND"
        ]));
        expect(fixture.runtime.repairBudget(run.runId)).toEqual({ attempts: 1, limit: 5, remaining: 4 });
        expect(() => fixture.runtime.registerBoundedRemediation(run.runId, "bounded-validation",
            input.branch, "abcdef2", "DUPLICATE")).toThrow("blocked production lineage");
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
                verifiedDimensions: ["DURABLE_DATA"] }],
            nativeJourneys: [{ journeyId: "native", behavior: "Native journey works", platforms: ["IOS", "ANDROID"],
                command: { command: "npm", args: ["run", "mobile:acceptance"],
                    publicEnvironment: { PBOS_ACCEPTANCE_COMMIT: input.commit } },
                artifacts: ["native-builds.json"], acceptanceArtifact: "native-acceptance.json",
                verifiedDimensions: ["AUTHORITY"] }] });
        fixture.runtime.recordAcceptanceEvidence(run.runId, [{ evidenceId: "old", dimension: "ROUTE", behavior: "Old route",
            repository: input.repository, commit: input.commit, artifact: "/", passed: true, source: "RUNTIME_PROBE" }]);
        const rebound = fixture.runtime.rebindRepositoryAfterRemediation(run.runId, "validation-1", "agent/remediated", "abcdef2");
        expect(rebound.currentCommit).toBe("abcdef2");
        expect(rebound.functionalAcceptancePlan).toMatchObject({ branch: "agent/remediated", commit: "abcdef2" });
        expect(rebound.functionalAcceptancePlan?.browserJourneys[0].command.publicEnvironment)
            .toMatchObject({ PBOS_ACCEPTANCE_COMMIT: "abcdef2" });
        expect(rebound.functionalAcceptancePlan?.nativeJourneys?.[0].command.publicEnvironment)
            .toMatchObject({ PBOS_ACCEPTANCE_COMMIT: "abcdef2" });
        expect(rebound.acceptanceEvidence).toEqual([]);
        expect(fixture.runtime.events(run.runId).at(-1)?.type).toBe("REMEDIATION_LINEAGE_REBOUND");
        fixture.state.saveProductionRun({ ...rebound, functionalAcceptancePlan: { ...rebound.functionalAcceptancePlan!,
            browserJourneys: rebound.functionalAcceptancePlan!.browserJourneys.map(journey => ({ ...journey,
                command: { ...journey.command, publicEnvironment: { ...journey.command.publicEnvironment,
                    PBOS_ACCEPTANCE_COMMIT: input.commit } } })),
            nativeJourneys: rebound.functionalAcceptancePlan!.nativeJourneys?.map(journey => ({ ...journey,
                command: { ...journey.command, publicEnvironment: { ...journey.command.publicEnvironment,
                    PBOS_ACCEPTANCE_COMMIT: input.commit } } })) } });
        const normalized = fixture.runtime.normalizeFunctionalAcceptanceLineage(run.runId);
        expect(normalized.currentCommit).toBe("abcdef2");
        expect(normalized.functionalAcceptancePlan?.browserJourneys[0].command.publicEnvironment)
            .toMatchObject({ PBOS_ACCEPTANCE_COMMIT: "abcdef2" });
        expect(normalized.functionalAcceptancePlan?.nativeJourneys?.[0].command.publicEnvironment)
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

    it("projects separate exact-revision application previews and excludes simulated or stale lineage", () => {
        const fixture = runtime();
        fixture.state.saveSystem({ systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001",
            name: "The Playbook", domain: "Education", repository: "sgwalton87/playbook-platform",
            defaultBranch: "main", status: "READY", capabilities: [] });
        fixture.state.saveSystem({ systemId: "BULLETPROOF-SYSTEM-001", operatingSystemId: "BULLETPROOF-OS-001",
            name: "Bulletproof Beneficiary", domain: "Legacy Planning",
            repository: "vycoywalton/bulletproof-beneficiary-registry", defaultBranch: "main",
            status: "READY", capabilities: [] });
        const playbook = fixture.runtime.begin({ ...input, runId: "playbook-preview-run", commit: "aaaaaaa" });
        const bulletproof = fixture.runtime.begin({ ...input, runId: "bulletproof-preview-run",
            systemId: "BULLETPROOF-SYSTEM-001", repository: "vycoywalton/bulletproof-beneficiary-registry",
            commit: "bbbbbbb" });
        const manifest = (runId: string, repository: string, commit: string, previewId: string) => ({
            previewId, runId, repository, branch: "agent/preview", commit, status: "READY" as const,
            webUrl: `https://${previewId}.example.com`, mobileUrl: `https://expo.dev/${previewId}`,
            routes: ["/"], personas: ["MEMBER"], viewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
            screenshots: [], generatedAt: "2026-08-06T00:00:00.000Z", label: "LIVE" as const });
        fixture.runtime.recordPreview(manifest(playbook.runId, playbook.repository, playbook.currentCommit, "playbook"));
        fixture.runtime.recordPreview(manifest(bulletproof.runId, bulletproof.repository, bulletproof.currentCommit, "bulletproof"));
        fixture.runtime.recordPreview({ ...manifest(playbook.runId, playbook.repository, "ccccccc", "stale"), label: "SIMULATED" });

        expect(fixture.runtime.snapshot().applicationPreviews).toMatchObject([
            { systemId: "BULLETPROOF-SYSTEM-001", systemName: "Bulletproof Beneficiary", commit: "bbbbbbb" },
            { systemId: "PLAYBOOK-SYSTEM-001", systemName: "The Playbook", commit: "aaaaaaa" }
        ]);
    });

    it("issues application delivery proof only after exact-revision functional and preview acceptance", () => {
        const fixture = runtime();
        fixture.state.saveSystem({ systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001",
            name: "The Playbook", domain: "Education", repository: "sgwalton87/playbook-platform",
            defaultBranch: "main", status: "READY", capabilities: [] });
        const run = fixture.runtime.begin({ ...input, runId: "delivery-run", commit: "ddddddd" });
        const webUrl = "https://playbook-preview.example.com";
        const mobileUrl = "https://expo.dev/playbook-preview";
        fixture.runtime.recordPreview({ previewId: "delivery-preview", runId: run.runId, repository: run.repository,
            branch: run.currentBranch, commit: run.currentCommit, status: "READY", webUrl, mobileUrl,
            routes: ["/login", "/dashboard"], personas: ["SCHOLAR"],
            viewports: ["DESKTOP_1440X900", "MOBILE_390X844"], screenshots: [],
            generatedAt: "2026-08-06T00:00:00.000Z", label: "LIVE" });
        expect(fixture.runtime.applicationDeliveryProofs()).toEqual([]);
        const plan: FunctionalAcceptancePlan = { planId: "delivery:ddddddd", systemId: run.systemId,
            productNodeId: "THE-PLAYBOOK", journeyId: "SCHOLAR", repository: run.repository,
            branch: run.currentBranch, commit: run.currentCommit, workingDirectory: "/tmp/playbook",
            launch: { command: "npm", args: ["run", "start"], baseUrl: "http://127.0.0.1:3000",
                healthPath: "/login", startupTimeoutMs: 1_000 }, probes: [], browserJourneys: [],
            durablePreview: { webUrl, mobileUrl, healthPath: "/login", label: "LIVE" } };
        const dimensions: ApplicationAcceptanceEvidence["dimension"][] = ["ROUTE", "USER_INTERFACE",
            "ACCEPTANCE_TEST", "INDEPENDENT_VALIDATION", "PREVIEW"];
        fixture.state.saveProductionRun({ ...fixture.state.productionRun(run.runId)!, status: "AWAITING_APPROVAL",
            functionalAcceptancePlan: plan, acceptanceEvidence: dimensions.map(dimension => ({
                evidenceId: `delivery:${dimension}`, dimension, behavior: `${dimension} passed`,
                repository: run.repository, commit: run.currentCommit, artifact: `${webUrl}#${dimension}`,
                passed: true, source: dimension === "INDEPENDENT_VALIDATION" ? "CI_VALIDATION" : "APPLICATION_TEST" })) });

        expect(fixture.runtime.applicationDeliveryProofs()).toMatchObject([{ systemId: "PLAYBOOK-SYSTEM-001",
            deliveryState: "VALIDATED", webUrl, mobileUrl, evidenceIds: expect.arrayContaining([
                "delivery:INDEPENDENT_VALIDATION", "delivery:PREVIEW"
            ]) }]);
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
