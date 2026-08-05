import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { GenesisWorkflowService } from "../../genesis-console";
import { RemediationRun, ResumableRemediationEngine } from "../../validation-automation";
import { AutonomousBatchService, BackgroundMonitor, OperatorMemoService } from "../index";

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
    headSha: "sha", attempt: 1, maximumAttempts: 5, state: "READY_FOR_CERTIFICATION", evidence: [], blockers: [], updatedAt: new Date().toISOString() };

describe("operator continuity", () => {
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
});
