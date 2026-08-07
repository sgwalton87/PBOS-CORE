import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { createPlaybookBlueprint } from "../../reference-systems";
import { AutonomousBatchService } from "../index";

const session = {
    sessionId: "session", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook", domain: "Education",
        repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const, capabilities: ["WORKFLOWS"] },
    grant: { grantId: "grant", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform", branchPattern: "agent/*",
        mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }
};

describe("CIP-051 autonomous build batches", () => {
    it("classifies CIP-050 isolation as a human-certified platform artifact", () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-isolation-policy-")), "state.json"));
        new AutonomousBatchService(state).prepareReadinessQueue("PLAYBOOK-SYSTEM-001", "abcdef1");
        expect(state.missionQueue("PLAYBOOK-SYSTEM-001").find(item => item.missionId === "050-isolation"))
            .toMatchObject({ approvalRequired: true, completionPolicy: { kind: "PLATFORM_ARTIFACT" } });
    });

    it("persists at most ten authorized work packages and follows validation state", () => {
        const statePath = join(mkdtempSync(join(tmpdir(), "pbos-batch-")), "state.json");
        const state = new GenesisStateRepository(statePath);
        const service = new AutonomousBatchService(state);
        const blueprint = createPlaybookBlueprint();
        const workPackages = Array.from({ length: 12 }, (_, index) => ({ id: `wp-${index + 1}`, missionId: `m-${index + 1}`,
            title: `Package ${index + 1}`, acceptanceCriteria: [], validationRules: [], certificationRequirements: [], evidence: [] }));
        const plan = { planId: "plan", blueprintId: blueprint.blueprintId, repositoryRevision: "sha", blueprint,
            inspection: { repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, revision: "sha", findings: [], inspectedAt: new Date() },
            gaps: [], missions: [], workPackages, implementationPlan: [], status: "READY_FOR_APPROVAL" as const, blockers: [], generatedAt: new Date() };
        const batchId = service.beginBatch(session.system.systemId, session.sessionId, workPackages.slice(0, 10));
        service.packageStarted(batchId, session.system.systemId, session.sessionId, workPackages[0].id, workPackages[0].title);
        service.packageCompleted(batchId, session.system.systemId, session.sessionId, workPackages[0].id, workPackages[0].title);
        const batch = service.start(session, plan, 10, { number: 50, branch: "agent/batch", repository: "sgwalton87/playbook-platform",
            url: "https://github.com/sgwalton87/playbook-platform/pull/50" }, "run", batchId);
        expect(batch.workPackages).toHaveLength(10);
        expect(new GenesisStateRepository(statePath).autonomousBatches()[0].batchId).toBe(batch.batchId);
        expect(service.updateForValidation("run", "WAITING_FOR_INFRASTRUCTURE")?.state).toBe("WAITING_FOR_INFRASTRUCTURE");
        expect(service.updateForValidation("run", "REMEDIATION_PUSHED")?.state).toBe("REMEDIATING");
        expect(service.updateForValidation("run", "READY_FOR_CERTIFICATION")?.state).toBe("READY_FOR_CERTIFICATION");
        expect(state.batchTelemetry(batch.batchId).map(event => event.type)).toEqual(expect.arrayContaining([
            "BATCH_STARTED", "WORK_PACKAGE_QUEUED", "WORK_PACKAGE_STARTED", "WORK_PACKAGE_COMPLETED",
            "SECTION_COMPLETED", "VALIDATION_STARTED", "INFRASTRUCTURE_WAIT", "REMEDIATION_STARTED", "BATCH_READY_FOR_APPROVAL"
        ]));
    });

    it("rejects authorization above the ten-package governance ceiling", () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-batch-")), "state.json"));
        const service = new AutonomousBatchService(state);
        expect(() => service.start(session, {} as never, 11, {} as never, "run")).toThrow("between 1 and 10");
    });
});
