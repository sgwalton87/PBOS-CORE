import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { playbookMobileFoundationExecutor } from "../playbook-mobile-foundation-executor";

const run = { runId: "34567890-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingBranch: "main", startingCommit: "def1234" } as ProductionRun;
const mission = { missionId: "049-mobile-foundation", systemId: "PLAYBOOK-SYSTEM-001", title: "Generate shared iOS and Android application foundation",
    dependencies: ["048-product-journeys"], status: "ACTIVE" as const, rationale: "Product journeys passed.", approvalRequired: true, evidenceIds: [] };

describe("CIP-049 mobile foundation adapter", () => {
    it("materializes a reproducible Expo workspace without performing protected releases", async () => {
        const generated = new Map<string, string>(); let lockPrepared = false; let committed: readonly string[] = [];
        const gateway = { inspectRepository: async () => ({ revision: "def1234" }),
            readFileAtRevision: async (_reference: unknown, path: string) => path === "package.json"
                ? '{"name":"playbook-platform","private":true,"scripts":{"test":"vitest run"}}'
                : path === "tsconfig.json" ? '{"include":["**/*.ts","**/*.tsx"],"exclude":["node_modules"]}'
                    : '{"state":"IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION","journeys":[]}',
            createBranch: async () => undefined,
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path); },
            prepareExpoDependencyLock: async (_reference: unknown, workspace: string) => {
                expect(workspace).toBe("apps/mobile"); lockPrepared = true; },
            commit: async (_reference: unknown, _message: string, paths: readonly string[]) => { committed = paths; return "abc1234"; },
            push: async () => undefined,
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/64", number: 64,
                branch: "agent/mobile", repository: "sgwalton87/playbook-platform" }) } as unknown as GitHubRepositoryGateway;
        const result = await playbookMobileFoundationExecutor({ gateway, session: {} as never,
            authorize: action => ({ decisionId: action, grantId: "grant", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-mobile", systemId: "PLAYBOOK-SYSTEM-001",
                pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS",
                evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } })({ run, mission, report: () => undefined });

        expect(lockPrepared).toBe(true);
        expect(committed).toContain("package-lock.json");
        expect(generated.get("package.json")).toContain('"apps/mobile"');
        expect(generated.get("tsconfig.json")).toContain('"apps/mobile"');
        expect(generated.get("apps/mobile/package.json")).toContain('"expo"');
        expect(generated.get("apps/mobile/src/platform/session-store.ts")).toContain("WHEN_UNLOCKED_THIS_DEVICE_ONLY");
        expect(generated.get("apps/mobile/src/platform/deep-links.ts")).toContain("Secrets are forbidden");
        expect(generated.get("pbos/readiness/049-mobile-foundation.json")).toContain("IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION");
        expect(result.functionalAcceptancePlan).toBeUndefined();
        expect(JSON.stringify(result)).not.toContain("SUBMIT_APP_STORE");
    });
});
