import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { playbookProductJourneysExecutor } from "../playbook-product-journeys-executor";

const session = { sessionId: "session-product", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook", domain: "Education",
        repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const, capabilities: [] },
    grant: { grantId: "grant", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform", branchPattern: "agent/*",
        mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } };
const run = { runId: "12345678-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingBranch: "main", startingCommit: "cdef123" } as ProductionRun;
const mission = { missionId: "048-product-journeys", systemId: "PLAYBOOK-SYSTEM-001", title: "Certify connected Playbook product journeys",
    dependencies: [], status: "ACTIVE" as const, rationale: "All journey dependencies are complete.", approvalRequired: true, evidenceIds: [] };
const contractByPath: Readonly<Record<string, string>> = {
    "tests/acceptance/pbos-scholar.spec.ts": "SCHOLAR-ONBOARDING-TO-DASHBOARD",
    "tests/acceptance/pbos-academic.spec.ts": "TRANSCRIPT-TO-ACADEMIC-READINESS",
    "tests/acceptance/pbos-opportunity.spec.ts": "READINESS-TO-OPPORTUNITY",
    "tests/acceptance/pbos-application.spec.ts": "OPPORTUNITY-TO-APPLICATION",
    "tests/acceptance/pbos-support.spec.ts": "APPLICATION-TO-AUTHORIZED-SUPPORT",
    "tests/acceptance/pbos-messaging.spec.ts": "AUTHORIZED-SUPPORT-MESSAGING",
    "tests/acceptance/pbos-notifications.spec.ts": "EVENT-TO-ACKNOWLEDGED-NOTIFICATION"
};

describe("CIP-048 connected product execution adapter", () => {
    it("composes seven exact-revision journeys into one runtime and one pull request", async () => {
        const generated = new Map<string, string>();
        const gateway = { inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            revision: "cdef123", findings: [], files: [], inspectedAt: new Date() }),
        readFileAtRevision: async (_reference: unknown, path: string) => path === "package.json"
            ? '{"scripts":{"pbos:acceptance:prepare":"node prepare.mjs"}}' : contractByPath[path] ?? "",
        workingDirectory: async () => "/tmp/playbook-product", createBranch: async () => undefined,
        applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
            files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path); },
        prepareDependencyLock: async () => undefined, commit: async () => "abcde12", push: async () => undefined,
        openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/62", number: 62,
            branch: "agent/pbos-product", repository: "sgwalton87/playbook-platform" }) } as unknown as GitHubRepositoryGateway;
        const executor = playbookProductJourneysExecutor({ gateway, session, authorize: action => ({ decisionId: action, grantId: "grant",
            action, allowed: true, reason: "authorized", decidedAt: new Date() }), remediation: { start: (_systemId, pullRequest) => ({
                runId: "validation-product", systemId: "PLAYBOOK-SYSTEM-001", pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5,
                state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } });
        const result = await executor({ run, mission, report: () => undefined });
        expect(JSON.parse(generated.get("pbos/readiness/048-product-journeys.json") ?? "{}").journeys).toHaveLength(7);
        expect(generated.get("tests/acceptance/pbos-academic.spec.ts")).toContain("passed: true");
        expect(result.functionalAcceptancePlan?.browserJourneys).toHaveLength(7);
        expect(new Set(result.functionalAcceptancePlan?.browserJourneys.map(item =>
            item.command.publicEnvironment?.PLAYWRIGHT_BASE_URL))).toEqual(new Set(["http://127.0.0.1:4317"]));
        expect(result.acceptanceEvidence?.some(item => item.dimension === "INDEPENDENT_VALIDATION")).toBe(false);
    });

    it("fails closed when a journey contract is missing", async () => {
        const gateway = { inspectRepository: async () => ({ revision: "cdef123" }),
            readFileAtRevision: async (_reference: unknown, path: string) => path === "package.json" ? "{}" : "",
        } as unknown as GitHubRepositoryGateway;
        const executor = playbookProductJourneysExecutor({ gateway, session, authorize: action => ({ decisionId: action, grantId: "grant",
            action, allowed: true, reason: "authorized", decidedAt: new Date() }), remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("missing or stale");
    });
});
