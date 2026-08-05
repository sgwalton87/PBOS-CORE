import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { ApplicationAcceptanceDimension, ApplicationAcceptanceEvidence, FunctionalAcceptanceVerifier,
    MissionQueueItem, ProductionRuntimeService } from "../index";

const repository = "sgwalton87/playbook-platform";
const commit = "abcdef1";
const dimensions: readonly ApplicationAcceptanceDimension[] = ["ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY",
    "PBOS_INTEGRATION", "ACCEPTANCE_TEST", "ACCESSIBILITY", "SECURITY", "INDEPENDENT_VALIDATION"];
const mission: MissionQueueItem = { missionId: "048-functional-test", systemId: "PLAYBOOK-SYSTEM-001", title: "Complete real behavior",
    dependencies: [], status: "ACTIVE", rationale: "Approved", approvalRequired: true, evidenceIds: [],
    completionPolicy: { kind: "FUNCTIONAL_APPLICATION", requiredDimensions: dimensions,
        acceptanceCriteria: ["A user completes the behavior", "The result survives restart"] } };

const proof = (dimension: ApplicationAcceptanceDimension, revision = commit): ApplicationAcceptanceEvidence => ({
    evidenceId: `${dimension.toLowerCase()}:${revision}`, dimension, behavior: `${dimension} behavior is proven.`,
    repository, commit: revision, artifact: `artifact/${dimension.toLowerCase()}`, passed: true,
    source: dimension === "INDEPENDENT_VALIDATION" ? "CI_VALIDATION" : dimension === "ACCEPTANCE_TEST"
        ? "APPLICATION_TEST" : "IMPLEMENTATION"
});

describe("functional application completion truth", () => {
    it("rejects generated files that do not prove every required behavior dimension", () => {
        const evidence = dimensions.filter(item => !["USER_INTERFACE", "DURABLE_DATA"].includes(item)).map(item => proof(item));
        expect(() => new FunctionalAcceptanceVerifier().assertImplementationEvidence(mission, evidence, repository, commit))
            .toThrow("USER_INTERFACE, DURABLE_DATA");
    });

    it("rejects evidence or CI attached to a different application revision", () => {
        const evidence = dimensions.filter(item => item !== "INDEPENDENT_VALIDATION").map(item => proof(item));
        evidence[0] = proof(evidence[0].dimension, "1234567");
        expect(() => new FunctionalAcceptanceVerifier().assertImplementationEvidence(mission, evidence, repository, commit))
            .toThrow("exact application commit");
    });

    it("does not allow a green validation string to transition functional work to approval", () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-functional-truth-")), "state.json"));
        state.saveMissionQueue([mission], mission.systemId);
        const runtime = new ProductionRuntimeService(state);
        const run = runtime.begin({ systemId: mission.systemId, actorId: "operator", authorizationArtifactId: "approval",
            repository, branch: "agent/functional", commit, objective: mission.title, mission: mission.title, rationale: mission.rationale });
        runtime.transition(run.runId, "QUEUED", "Queued");
        runtime.transition(run.runId, "STARTING", "Starting");
        runtime.transition(run.runId, "RUNNING", "Running");
        runtime.transition(run.runId, "VALIDATING", "Validating");
        runtime.recordValidation(run.runId, "GitHub Actions", true, 1, "green-check");
        expect(() => runtime.transition(run.runId, "AWAITING_APPROVAL", "Green"))
            .toThrow("missing acceptance evidence");
        expect(runtime.run(run.runId)?.status).toBe("VALIDATING");
    });

    it("accepts exact-revision implementation plus independent validation evidence", () => {
        const evidence = dimensions.map(item => proof(item));
        const run = { repository, currentCommit: commit, acceptanceEvidence: evidence, previewArtifactIds: [] } as
            unknown as import("../index").ProductionRun;
        expect(() => new FunctionalAcceptanceVerifier().assertCertificationEvidence(mission, run)).not.toThrow();
    });
});
