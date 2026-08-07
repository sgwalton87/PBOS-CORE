import { mkdtempSync, readFileSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository, OperatorIdentityService } from "../../genesis-state";
import { applicationDeliverySummary, durableMissionApproval, ensureReadinessQueue, latestUnfinishedRuns, promptForInlinePlatformCertification,
    isResumableProductionValidationStatus, playbookDoctorReadiness, promptForEcosystemCertificationApprovals, promptForMissionApproval,
    streamProductionTelemetry } from "../pbos-cli";
import { RemediationRun } from "../../validation-automation";
import { AutonomousBatchService } from "../../operator-continuity";
import { createPlaybookBlueprint } from "../../reference-systems";
import { GitHubRepositoryGateway } from "../../platform";
import { ApplicationAcceptanceEvidence, FunctionalAcceptancePlan, ProductionRuntimeService } from "../../production-runtime";
import { ensureFunctionalAcceptanceAuthority, functionalAcceptanceAuthorityDefinition } from "../functional-acceptance-authority";

class ApprovalIO {
    readonly output: string[] = [];
    constructor(private readonly answer: string) {}
    write(message: string): void { this.output.push(message); }
    prompt(_message: string): Promise<string> { return Promise.resolve(this.answer); }
    close(): void {}
}

describe("partner-ready CLI durable state", () => {
    it("routes validated production runs back to the protected release checkpoint", () => {
        expect(isResumableProductionValidationStatus("AWAITING_APPROVAL")).toBe(true);
        expect(isResumableProductionValidationStatus("VALIDATING")).toBe(true);
        expect(isResumableProductionValidationStatus("CERTIFIED")).toBe(false);
        expect(isResumableProductionValidationStatus("COMPLETED")).toBe(false);
    });

    it("blocks the Playbook doctor when the active academic acceptance environment is incomplete", () => {
        expect(playbookDoctorReadiness(true, false, false)).toBe("BLOCKED");
        expect(playbookDoctorReadiness(true, false, true)).toBe("READY");
        expect(playbookDoctorReadiness(false, true, true)).toBe("READY_FOR_GOVERNED_MIGRATION");
    });

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

    it("binds exact-revision connected-journey authority to the protected PBOS source", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-cli-acceptance-authority-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        const identities = new OperatorIdentityService(join(root, "operators.json"));
        const enrolled = identities.enroll("PBOS-ORG-001", "Founder");
        const operator = identities.authenticate(enrolled.operator.operatorId, enrolled.credential);
        const protectedFile = join(root, "secrets", "playbook-scholar-acceptance.env");
        const io = new ApprovalIO("yes");

        const approval = await ensureFunctionalAcceptanceAuthority(io, { state, identities, operator },
            "048-opportunity-journey", "abcdef1", protectedFile);

        expect(approval && identities.verify(approval, "AUTHORIZE_FUNCTIONAL_ACCEPTANCE",
            "048-opportunity-journey:abcdef1")).toBe(true);
        expect(readFileSync(protectedFile, "utf8")).toContain(`PBOS_OPPORTUNITY_JOURNEY_APPROVAL_ID=${approval?.approvalId}`);
        expect(statSync(protectedFile).mode & 0o077).toBe(0);
        expect(state.audit().at(-1)).toMatchObject({ type: "VERIFIABLE_APPROVAL",
            resource: "048-opportunity-journey:abcdef1",
            evidence: { purpose: "AUTHORIZE_FUNCTIONAL_ACCEPTANCE", commit: "abcdef1" } });
        expect(io.output.join("\n")).toContain("Production, merge, certification, secrets");

        const auditCount = state.audit().length;
        const reused = await ensureFunctionalAcceptanceAuthority(new ApprovalIO("no"), { state, identities, operator },
            "048-opportunity-journey", "abcdef1", protectedFile);
        expect(reused?.approvalId).toBe(approval?.approvalId);
        expect(state.audit()).toHaveLength(auditCount);
    });

    it("registers acceptance authority for every connected Playbook journey without domain leakage", () => {
        expect([
            "048-opportunity-journey", "048-application-journey", "048-support-journey",
            "048-messaging-journey", "048-notification-journey"
        ].map(missionId => functionalAcceptanceAuthorityDefinition(missionId)?.environmentVariable)).toEqual([
            "PBOS_OPPORTUNITY_JOURNEY_APPROVAL_ID", "PBOS_APPLICATION_JOURNEY_APPROVAL_ID",
            "PBOS_SUPPORT_REQUEST_APPROVAL_ID", "PBOS_MESSAGING_JOURNEY_APPROVAL_ID",
            "PBOS_NOTIFICATION_JOURNEY_APPROVAL_ID"
        ]);
        expect(functionalAcceptanceAuthorityDefinition("049-mobile-foundation")).toBeUndefined();
    });

    it("describes the bounded EAS authority when mobile final certification is requested", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-cli-mobile-certification-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        const identities = new OperatorIdentityService(join(root, "operators.json"));
        const enrolled = identities.enroll("PBOS-ORG-001", "Founder");
        const operator = identities.authenticate(enrolled.operator.operatorId, enrolled.credential);
        const mission = { missionId: "049-certification", systemId: "PLAYBOOK-SYSTEM-001",
            title: "Certify mobile release candidates", dependencies: ["049-store-readiness"],
            status: "ELIGIBLE" as const, rationale: "Store readiness is certified.",
            approvalRequired: true, evidenceIds: [] };
        state.saveMissionQueue([mission], mission.systemId);
        const io = new ApprovalIO("no");

        await promptForMissionApproval(io, { state, identities, operator }, mission);

        expect(io.output.join("\n")).toContain("exact-revision EAS internal builds");
        expect(io.output.join("\n")).toContain("Public release");
        expect(state.audit()).toHaveLength(0);
    });

    it("uses a distinct certification decision after inline platform validation", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-cli-platform-certification-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        const identities = new OperatorIdentityService(join(root, "operators.json"));
        const enrolled = identities.enroll("PBOS-ORG-001", "Founder");
        const operator = identities.authenticate(enrolled.operator.operatorId, enrolled.credential);
        const mission = { missionId: "050-isolation", systemId: "PLAYBOOK-SYSTEM-001",
            title: "Prove shared PBOS contracts and independent ownership", dependencies: ["050-platform-evidence"],
            status: "ACTIVE" as const, rationale: "Platform evidence is complete.", approvalRequired: true,
            evidenceIds: [], completionPolicy: { kind: "PLATFORM_ARTIFACT" as const, requiredDimensions: [],
                acceptanceCriteria: ["Independent ownership is proven"] } };
        state.saveMissionQueue([{
            missionId: "050-platform-evidence", systemId: "PLAYBOOK-SYSTEM-001",
            title: "Compile independent multi-platform ecosystem evidence", dependencies: [],
            status: "COMPLETE" as const, rationale: "Platform evidence compiled.", approvalRequired: false,
            evidenceIds: ["ecosystem-report:report-1"], completionPolicy: { kind: "PLATFORM_ARTIFACT" as const,
                requiredDimensions: [], acceptanceCriteria: ["Independent scorecards are complete"] }
        }, mission], mission.systemId);
        const production = new ProductionRuntimeService(state);
        let run = production.begin({ systemId: mission.systemId, actorId: operator.operatorId,
            authorizationArtifactId: "start-approval", repository: "sgwalton87/playbook-platform", branch: "main",
            commit: "abcdef1", objective: mission.title, mission: mission.title, rationale: mission.rationale });
        production.transition(run.runId, "QUEUED", "Queued");
        production.transition(run.runId, "STARTING", "Starting");
        production.transition(run.runId, "RUNNING", "Running");
        production.transition(run.runId, "VALIDATING", "Validating");
        run = production.transition(run.runId, "AWAITING_APPROVAL", "Validated");
        const io = new ApprovalIO("yes");

        const certified = await promptForInlinePlatformCertification(io, { state, identities, operator,
            authorizeCertification: (_branch, approvalId) => ({ decisionId: "decision", grantId: "grant",
                action: "CERTIFY_SYSTEM", allowed: true, reason: "explicitly approved", explicitApprovalId: approvalId,
                decidedAt: new Date() }) }, run, mission);

        expect(certified).toBe(true);
        expect(state.productionRun(run.runId)?.status).toBe("CERTIFIED");
        expect(state.missionQueue(mission.systemId).find(item => item.missionId === mission.missionId)?.status).toBe("COMPLETE");
        expect(state.audit().at(-1)?.evidence).toMatchObject({ purpose: "CERTIFY_PRODUCTION_MISSION" });
        expect(io.output.join("\n")).toContain("no pull request or application merge was invented");
    });

    it("issues distinct signed application and platform decisions for final ecosystem certification", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-cli-ecosystem-approvals-"));
        const state = new GenesisStateRepository(join(root, "state.json"));
        const identities = new OperatorIdentityService(join(root, "operators.json"));
        const enrolled = identities.enroll("PBOS-ORG-001", "Founder");
        const operator = identities.authenticate(enrolled.operator.operatorId, enrolled.credential);
        const io = new ApprovalIO("yes");

        expect(await promptForEcosystemCertificationApprovals(io, { state, identities, operator })).toBe(true);

        const approvals = state.audit().filter(item => item.type === "VERIFIABLE_APPROVAL");
        expect(approvals).toHaveLength(8);
        expect(new Set(approvals.map(item => item.eventId)).size).toBe(8);
        expect(approvals.filter(item => item.evidence.purpose === "CERTIFY_ECOSYSTEM_SYSTEM")).toHaveLength(2);
        expect(approvals.filter(item => item.evidence.purpose === "CERTIFY_ECOSYSTEM_PLATFORM")).toHaveLength(6);
        expect(io.output.join("\n")).toContain("The Playbook WEB release authority");
        expect(io.output.join("\n")).toContain("Bulletproof Beneficiary ANDROID release authority");
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
        state.saveSystem({ systemId: run.systemId, operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
            domain: "Education", repository: run.repository, defaultBranch: "main", status: "READY", capabilities: [] });
        const webUrl = "https://playbook-preview.example.com";
        const mobileUrl = "https://expo.dev/playbook-preview";
        const plan: FunctionalAcceptancePlan = { planId: "delivery:abcdef1", systemId: run.systemId,
            productNodeId: "THE-PLAYBOOK", journeyId: "SCHOLAR", repository: run.repository,
            branch: run.currentBranch, commit: run.currentCommit, workingDirectory: "/tmp/playbook",
            launch: { command: "npm", args: ["run", "start"], baseUrl: "http://127.0.0.1:3000",
                healthPath: "/login", startupTimeoutMs: 1_000 }, probes: [], browserJourneys: [],
            durablePreview: { webUrl, mobileUrl, healthPath: "/login", label: "LIVE" } };
        const dimensions: ApplicationAcceptanceEvidence["dimension"][] = ["ROUTE", "USER_INTERFACE",
            "ACCEPTANCE_TEST", "INDEPENDENT_VALIDATION", "PREVIEW"];
        state.saveProductionRun({ ...state.productionRun(run.runId)!, functionalAcceptancePlan: plan,
            acceptanceEvidence: dimensions.map(dimension => ({ evidenceId: `delivery:${dimension}`, dimension,
                behavior: `${dimension} passed`, repository: run.repository, commit: run.currentCommit,
                artifact: `${webUrl}#${dimension}`, passed: true,
                source: dimension === "INDEPENDENT_VALIDATION" ? "CI_VALIDATION" : "APPLICATION_TEST" })) });
        production.recordPreview({ previewId: "delivery-preview", runId: run.runId, repository: run.repository,
            branch: run.currentBranch, commit: run.currentCommit, status: "READY", webUrl, mobileUrl,
            routes: ["/login"], personas: ["SCHOLAR"], viewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
            screenshots: [], generatedAt: new Date().toISOString(), label: "LIVE" });
        const output: string[] = [];
        const result = await streamProductionTelemetry(state, run.runId, message => output.push(message), async () => undefined, 0, 1);
        expect(result).toBe("AWAITING_APPROVAL");
        expect(output.some(line => line.includes("HUMAN APPROVAL REQUIRED"))).toBe(true);
        expect(output.some(line => line.includes("RUN_AWAITING_APPROVAL"))).toBe(true);
        expect(output).toContain(`Desktop web: ${webUrl}`);
        expect(output).toContain(`Mobile: ${mobileUrl}`);
        expect(applicationDeliverySummary(state, run.systemId)[0]).toBe("PBOS APPLICATION DELIVERY READY");
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
