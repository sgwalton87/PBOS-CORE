import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { ProductionRecoveryAuthority, ProductionRuntimeService } from "../index";

const productionInput = {
    systemId: "PLAYBOOK-SYSTEM-001", actorId: "operator-1", authorizationArtifactId: "mission-approval-1",
    repository: "sgwalton87/playbook-platform", branch: "agent/playbook", commit: "fc9ca27",
    objective: "Finish The Playbook", mission: "Complete Scholar onboarding-to-dashboard slice",
    rationale: "Existing governed mission", buildChannel: {
        channelId: "channel-1", systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001",
        connectorId: "PLAYBOOK-CONNECTOR-001", repository: "sgwalton87/playbook-platform",
        domainRegistrationIds: ["PLAYBOOK-SCHOLAR-REGISTRATION-001"]
    }
} as const;

describe("constitutional Production Recovery Authority", () => {
    it("opens a new epoch after exhaustion while preserving the same run, mission, repairs, state, and evidence", () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-recovery-authority-")), "state.json"));
        const production = new ProductionRuntimeService(state);
        production.reconcileQueue(productionInput.systemId, [{
            missionId: "048-scholar-slice", systemId: productionInput.systemId, title: productionInput.mission,
            dependencies: [], status: "ACTIVE", rationale: productionInput.rationale, approvalRequired: true,
            evidenceIds: ["constitutional:PBS-5000", "repository:fc9ca27"], executionBlocker: "Browser acceptance remains incomplete."
        }]);
        const run = production.begin(productionInput);
        production.transition(run.runId, "QUEUED", "Queued");
        production.transition(run.runId, "STARTING", "Starting");
        production.transition(run.runId, "RUNNING", "Running");
        production.transition(run.runId, "VALIDATING", "Validating");
        production.recordValidation(run.runId, "Exact revision CI", true, 0, "remediation-run:pr-54");
        for (let attempt = 1; attempt <= 5; attempt += 1) {
            production.recordRepairAttempt(run.runId, `FUNCTIONAL_ACCEPTANCE_FAILURE_${attempt}`, "STARTED");
            production.recordRepairAttempt(run.runId, `FUNCTIONAL_ACCEPTANCE_FAILURE_${attempt}`, "FAILED");
        }
        production.transition(run.runId, "BLOCKED", "Functional application acceptance failed.");

        const authority = new ProductionRecoveryAuthority(state, production);
        const first = authority.request(run.runId);
        expect(first.reasonBudgetExhausted).toContain("5/5 bounded repair attempts");
        expect(first.attemptedRepairs.map(item => item.attempt)).toEqual([1, 2, 3, 4, 5]);
        expect(first.repositoryState).toMatchObject({ branch: productionInput.branch, commit: productionInput.commit,
            remediationRunIds: ["pr-54"] });
        expect(first.runtimeState).toMatchObject({ status: "BLOCKED", repairAttempts: 5, repairAttemptLimit: 5 });
        expect(first.remainingDefects).toEqual(expect.arrayContaining([
            "Browser acceptance remains incomplete.", "Functional application acceptance failed."
        ]));
        expect(first.lineageEvidenceIds).toContain("remediation-run:pr-54");

        authority.authorize(first.recoveryEpochId, "recovery-approval-1", productionInput.actorId,
            (approvalId, actorId, runId) => approvalId === "recovery-approval-1" &&
                actorId === productionInput.actorId && runId === run.runId);
        production.recordRepairAttempt(run.runId, "FUNCTIONAL_ACCEPTANCE_FAILURE_6", "STARTED");
        production.recordRepairAttempt(run.runId, "FUNCTIONAL_ACCEPTANCE_FAILURE_6", "FAILED");

        const second = authority.request(run.runId);
        const preservedRun = production.run(run.runId)!;
        expect(state.productionRecoveryEpoch(first.recoveryEpochId)?.status).toBe("EXHAUSTED");
        expect(second).toMatchObject({ epochNumber: 2, runId: run.runId, missionId: "048-scholar-slice",
            previousRecoveryEpochId: first.recoveryEpochId, status: "AWAITING_AUTHORIZATION" });
        expect(second.attemptedRepairs).toHaveLength(6);
        expect(preservedRun.repairAttempts).toBe(6);
        expect(preservedRun.repairAttemptLimit).toBe(6);
        expect(preservedRun.recoveryEpochIds).toEqual([first.recoveryEpochId, second.recoveryEpochId]);
        expect(preservedRun.evidenceIds).toEqual(expect.arrayContaining([
            "remediation-run:pr-54", `recovery-epoch:${first.recoveryEpochId}`,
            "approval:recovery-approval-1", `recovery-epoch:${second.recoveryEpochId}`
        ]));
        expect(state.productionRuns()).toHaveLength(1);
        expect(state.missionQueue(productionInput.systemId)).toHaveLength(1);
    });
});
