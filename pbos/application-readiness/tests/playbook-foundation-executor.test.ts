import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { playbookFoundationExecutor } from "../playbook-foundation-executor";

const session = {
    sessionId: "session-048", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
        domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const, capabilities: [] },
    grant: { grantId: "grant-048", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
        branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }
};

const run = { runId: "12345678-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingCommit: "abcdef1" } as ProductionRun;
const mission = { missionId: "048-foundation", systemId: "PLAYBOOK-SYSTEM-001", title: "Complete foundations",
    dependencies: [], status: "ACTIVE" as const, rationale: "Gap analysis complete.", approvalRequired: true, evidenceIds: [] };

describe("CIP-048 Playbook foundation execution adapter", () => {
    it("publishes real foundation code, prepares the lock, and starts durable validation", async () => {
        const calls: string[] = [];
        const gateway = {
            inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
                revision: "abcdef1", findings: ["DEPENDENCY_LOCK:PRESENT"], files: [], inspectedAt: new Date() }),
            createBranch: async (_reference: unknown, branch: string) => { calls.push(`branch:${branch}`); return branch; },
            applyChange: async (_reference: unknown, files: readonly { path: string }[]) => { calls.push(`files:${files.map(file => file.path).join(",")}`); return files.map(file => file.path); },
            prepareDependencyLock: async () => { calls.push("lock"); },
            commit: async (_reference: unknown, _message: string, paths: readonly string[]) => { calls.push(`commit:${paths.join(",")}`); return "1234567"; },
            push: async () => { calls.push("push"); },
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/52", number: 52,
                branch: "agent/pbos-playbook-system-001-048-foundation-12345678", repository: "sgwalton87/playbook-platform" })
        } as unknown as GitHubRepositoryGateway;
        const started: string[] = [];
        const executor = playbookFoundationExecutor({ gateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-048", action, allowed: true, reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-048", systemId: "PLAYBOOK-SYSTEM-001", pullRequest,
                headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) },
            startMonitor: validation => { started.push(validation.runId); } });
        const result = await executor({ run, mission, report: () => undefined });
        expect(calls).toContain("lock");
        expect(calls.some(call => call.includes("lib/pbos/foundation.ts") && call.includes("package-lock.json"))).toBe(true);
        expect(result.files?.added).toContain("tests/unit/pbos/playbook-foundation.test.ts");
        expect(result.files?.added).toContain(".pbos/archivist.json");
        expect(result.files?.added).toContain(".github/workflows/pbos-engineering-memory.yml");
        expect(result.deferredValidation).toEqual({ remediationRunId: "validation-048",
            pullRequestUrl: "https://github.com/sgwalton87/playbook-platform/pull/52" });
        expect(started).toEqual(["validation-048"]);
    });

    it("fails closed before mutation when repository authority denies an action", async () => {
        const executor = playbookFoundationExecutor({ gateway: {} as GitHubRepositoryGateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-048", action, allowed: false, reason: "revoked", decidedAt: new Date() }),
            remediation: { start: () => { throw new Error("not reached"); } }, startMonitor: () => undefined });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("denied: revoked");
    });
});
