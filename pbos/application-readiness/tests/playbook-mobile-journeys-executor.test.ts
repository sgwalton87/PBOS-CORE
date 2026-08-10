import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { playbookMobileJourneysExecutor } from "../playbook-mobile-journeys-executor";

const run = { runId: "45678901-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingBranch: "main", startingCommit: "abc1234" } as ProductionRun;
const mission = { missionId: "049-mobile-journeys", systemId: "PLAYBOOK-SYSTEM-001",
    title: "Complete primary mobile Scholar journeys", dependencies: ["049-mobile-foundation", "048-product-journeys"],
    status: "ACTIVE" as const, rationale: "The mobile foundation passed.", approvalRequired: true, evidenceIds: [],
    completionPolicy: { kind: "FUNCTIONAL_APPLICATION" as const,
        requiredDimensions: ["ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION",
            "ACCEPTANCE_TEST", "ACCESSIBILITY", "SECURITY", "INDEPENDENT_VALIDATION"] as const,
        acceptanceCriteria: ["Native Scholar journeys pass"] } };

describe("CIP-049 native journey adapter", () => {
    it("connects real governed journeys and produces native exact-revision acceptance", async () => {
        const generated = new Map<string, string>(); let lockPrepared = false;
        const gateway = { inspectRepository: async () => ({ revision: "abc1234" }),
            readFileAtRevision: async (_reference: unknown, path: string) => path === "package.json"
                ? '{"name":"playbook-platform","private":true,"scripts":{}}'
                : path === "apps/mobile/package.json"
                    ? '{"name":"@playbook-system-001/mobile","private":true,"scripts":{},"dependencies":{}}'
                    : '{"state":"IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION","targets":["IOS","ANDROID"],' +
                        '"productCanonicalGraphRevision":"abc1234","productJourneyIds":["SCHOLAR-ONBOARDING-TO-DASHBOARD"]}',
            workingDirectory: async () => "/private/tmp/playbook-native-acceptance",
            createBranch: async () => undefined,
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path); },
            prepareExpoDependencyLock: async (_reference: unknown, workspace: string) => {
                expect(workspace).toBe("apps/mobile"); lockPrepared = true; },
            commit: async () => "def5678", push: async () => undefined,
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/65", number: 65,
                branch: "agent/mobile-journeys", repository: "sgwalton87/playbook-platform" }) } as unknown as GitHubRepositoryGateway;
        const result = await playbookMobileJourneysExecutor({ gateway,
            session: { system: { systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform" } } as never,
            authorize: action => ({ decisionId: action, grantId: "grant", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-native", systemId: "PLAYBOOK-SYSTEM-001",
                pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS",
                evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } })({ run, mission, report: () => undefined });

        expect(lockPrepared).toBe(true);
        expect(generated.get("apps/mobile/src/platform/auth.ts")).toContain("signInWithPassword");
        expect(generated.get("apps/mobile/src/features/offline-queue.ts")).toContain("class NativeMutationQueue");
        expect(generated.get("apps/mobile/src/features/use-governed-resource.ts")).not.toContain("useEffect(()=>{void refresh()");
        expect(generated.get("apps/mobile/src/features/use-governed-resource.ts")).toContain("void load().then(value=>");
        expect(generated.get("apps/mobile/app/dashboard.tsx")).toContain("scholarMobileClient.dashboard");
        expect(generated.get("app/api/pbos/mobile/scholar/route.ts")).toContain("scholar_dashboard_projections");
        expect(generated.get("apps/mobile/scripts/native-acceptance.mjs")).toContain('"--platform", "ios"');
        expect(generated.get("pbos/readiness/049-mobile-journeys.json")).toContain("BOUNDED_IDEMPOTENT_QUEUE");
        expect(generated.get("pbos/readiness/049-mobile-journeys.json")).toContain('"productCanonicalGraphRevision": "abc1234"');
        expect(result.functionalAcceptancePlan?.nativeJourneys?.[0]).toMatchObject({
            journeyId: "PLAYBOOK-MOBILE-SCHOLAR-JOURNEYS", platforms: ["IOS", "ANDROID"]
        });
        expect(result.functionalAcceptancePlan?.commit).toBe("def5678");
    });
});
