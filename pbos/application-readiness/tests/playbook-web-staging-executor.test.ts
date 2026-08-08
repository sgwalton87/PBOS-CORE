import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { inspectPlaybookWebStagingReadiness, playbookWebStagingExecutor,
    playbookWebStagingProtectedEnvironmentFiles } from "../playbook-web-staging-executor";

const session = { sessionId: "session-web", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook", domain: "Education",
        repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const, capabilities: [] },
    grant: { grantId: "grant", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform", branchPattern: "agent/*",
        mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } };
const run = { runId: "23456789-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingBranch: "main", startingCommit: "def1234" } as ProductionRun;
const mission = { missionId: "048-web-staging", systemId: "PLAYBOOK-SYSTEM-001", title: "Deploy and accept Playbook web staging",
    dependencies: [], status: "ACTIVE" as const, rationale: "Product journeys passed.", approvalRequired: true, evidenceIds: [] };

describe("CIP-048 protected web-staging adapter", () => {
    it("reports all provider names when the protected file has not been created", async () => {
        const stateHome = mkdtempSync(join(tmpdir(), "pbos-web-staging-missing-"));

        const readiness = await inspectPlaybookWebStagingReadiness({}, stateHome);

        expect(readiness).toMatchObject({ ready: false, available: [],
            missing: ["VERCEL_PROJECT_ID", "VERCEL_TEAM_ID", "VERCEL_TOKEN"] });
    });

    it("diagnoses provider configuration by name without exposing values", async () => {
        const stateHome = mkdtempSync(join(tmpdir(), "pbos-web-staging-"));
        const [source] = playbookWebStagingProtectedEnvironmentFiles(stateHome);
        mkdirSync(join(stateHome, "secrets"), { recursive: true });
        writeFileSync(source.path, "VERCEL_TOKEN=protected-token\nVERCEL_PROJECT_ID=project-id\n", { mode: 0o600 });

        const readiness = await inspectPlaybookWebStagingReadiness({}, stateHome);

        expect(readiness).toMatchObject({ ready: false,
            available: ["VERCEL_PROJECT_ID", "VERCEL_TOKEN"], missing: ["VERCEL_TEAM_ID"] });
        expect(JSON.stringify(readiness)).not.toContain("protected-token");
    });

    it("prepares a deferred exact-revision Vercel deployment without deploying production", async () => {
        const generated = new Map<string, string>(); const approvals: Array<{ action: string; approval?: string }> = [];
        const gateway = { inspectRepository: async () => ({ revision: "def1234" }),
            readFileAtRevision: async () => '{"state":"IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION","journeys":[]}',
            workingDirectory: async () => "/tmp/playbook-web", createBranch: async () => undefined,
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path); },
            commit: async () => "abc1234", push: async () => undefined,
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/63", number: 63,
                branch: "agent/pbos-web-staging", repository: "sgwalton87/playbook-platform" }) } as unknown as GitHubRepositoryGateway;
        const executor = playbookWebStagingExecutor({ gateway, session, deploymentApprovalId: "staging-approval",
            authorize: (action, _risk, _branch, approval) => { approvals.push({ action, approval }); return { decisionId: action,
                grantId: "grant", action, allowed: true, reason: "authorized", explicitApprovalId: approval, decidedAt: new Date() }; },
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-web", systemId: "PLAYBOOK-SYSTEM-001",
                pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS",
                evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } });
        const result = await executor({ run, mission, report: () => undefined });
        expect(approvals).toContainEqual({ action: "DEPLOY_STAGING", approval: "staging-approval" });
        expect(result.functionalAcceptancePlan?.previewDeployment).toMatchObject({ provider: "VERCEL", commit: "abc1234",
            environment: "preview", approvalId: "staging-approval" });
        expect(result.functionalAcceptancePlan?.durablePreview).toBeUndefined();
        expect(result.acceptanceEvidence).toContainEqual(expect.objectContaining({ dimension: "PREVIEW", passed: true,
            commit: "abc1234" }));
        expect(generated.get("pbos/readiness/048-web-staging.json")).toContain("AUTHORIZED_PENDING_EXACT_REVISION_CI_AND_DEPLOYMENT");
    });

    it("refuses to inspect without explicit staging authority", async () => {
        const executor = playbookWebStagingExecutor({ gateway: {} as GitHubRepositoryGateway, session,
            deploymentApprovalId: "", authorize: action => ({ decisionId: action, grantId: "grant", action,
                allowed: true, reason: "authorized", decidedAt: new Date() }), remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("explicit durable operator approval");
    });
});
