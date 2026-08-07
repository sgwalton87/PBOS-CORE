import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import {
    assertOpportunityBaseline,
    isOpportunityIdentityIdempotencyDefect,
    isOpportunityJourneyContextDefect,
    playbookOpportunityJourneyExecutor,
    preparePlaybookOpportunityIdentityRecovery,
    preparePlaybookOpportunityJourneyContextRecovery,
    wireOpportunityAcceptanceApiEvidence,
    wireOpportunityAcceptanceJourneyContext,
    wireOpportunityIdentityIdempotency
} from "../playbook-opportunity-journey-executor";

const legacyPage = `"use client";
const demoCourses = [];
export default function OpportunitiesPage() {
  return <OpportunityMarketplace courses={demoCourses} />;
}`;
const legacyMarketplace = `const [saved, setSaved] = useState<Record<string, boolean>>({});
const [statuses, setStatuses] = useState<Record<string, string>>({});`;
const legacyOpportunityRoute = `import { PlaybookIdentityMapper } from "@/pbos/connector/identity-mapper";
function runtime() {
  const client = createClient();
  const mapper = new PlaybookIdentityMapper();
  return {
    async registerIdentity(userId: string) {
      const identity = mapper.mapSupabaseIdentity(userId, "SCHOLAR");
      const response = await client.send("REGISTER_IDENTITY", identity, "opportunity-identity-" + userId,
        "opportunity-identity-" + userId);
      if (!response.success) throw new Error(response.error.message);
      return identity;
    },
    async publish(identity: ReturnType<PlaybookIdentityMapper["mapSupabaseIdentity"]>, payload: Readonly<Record<string, unknown>>, correlationId: string) {
      return { identity, payload, correlationId };
    }
  };
}`;
const legacyOpportunityAcceptance = `test("opportunity", async ({ page }) => {
  const discovery = await page.request.post("/api/pbos/opportunities");
  expect(discovery.status()).toBe(200);
  const discovered = await discovery.json() as { matches?: Array<{ id: string; reasons?: string[] }> };
});`;
const opportunityAcceptanceWithoutJourneyContext = `test("opportunity", async ({ page }) => {
  await page.waitForURL(/\\/dashboard/);
  const discovery = await page.request.post("/api/pbos/opportunities");
  const discovered = await discovery.json() as { error?: string; matches?: Array<{ id: string; reasons?: string[] }> };
  expect(discovery.status(), "Opportunity discovery failed: " + (discovered.error ?? "unknown API error")).toBe(200);
  expect(discovered.matches?.length ?? 0).toBeGreaterThan(0);
});`;

const session = {
    sessionId: "session-opportunity", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
        domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const,
        capabilities: [] },
    grant: { grantId: "grant-opportunity", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
        branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [],
        maximumRisk: "MEDIUM" as const, issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000) }
};
const run = { runId: "12345678-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingBranch: "agent/pbos-academic-parent",
    startingCommit: "91e42fd" } as ProductionRun;
const mission = { missionId: "048-opportunity-journey", systemId: "PLAYBOOK-SYSTEM-001",
    title: "Complete readiness-to-opportunity journey", dependencies: ["048-academic-journey"], status: "ACTIVE" as const,
    rationale: "Academic evidence is ready.", approvalRequired: true, evidenceIds: [] };

describe("CIP-048 opportunity journey execution adapter", () => {
    it("replaces demo and browser-only behavior with owner-scoped durable PBOS functionality", async () => {
        const calls: string[] = [];
        const generated = new Map<string, string>();
        const generatedRevision = "abc1234def5678";
        const gateway = {
            inspectRepository: async (reference: { defaultBranch: string }) => {
                calls.push(`inspect:${reference.defaultBranch}`);
                return { repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: reference.defaultBranch },
                    revision: "91e42fd", findings: [], files: [], inspectedAt: new Date() };
            },
            readFileAtRevision: async (_reference: unknown, path: string, revision: string) => {
                calls.push(`read:${revision}:${path}`);
                if (path === "package.json") return '{"scripts":{},"devDependencies":{}}';
                return path === "app/opportunities/page.tsx" ? legacyPage : legacyMarketplace;
            },
            workingDirectory: async () => "/tmp/playbook-opportunity",
            createBranch: async (_reference: unknown, branch: string) => { calls.push(`branch:${branch}`); return branch; },
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); calls.push("files"); return files.map(file => file.path);
            },
            prepareDependencyLock: async () => { calls.push("lock"); },
            commit: async () => { calls.push("commit"); return generatedRevision; },
            push: async () => { calls.push("push"); },
            openDraftPullRequest: async (reference: { defaultBranch: string }) => {
                calls.push(`pr-base:${reference.defaultBranch}`);
                return { url: "https://github.com/sgwalton87/playbook-platform/pull/55", number: 55,
                    branch: "agent/pbos-playbook-system-001-048-opportunity-12345678",
                    repository: "sgwalton87/playbook-platform" };
            }
        } as unknown as GitHubRepositoryGateway;
        const executor = playbookOpportunityJourneyExecutor({ gateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-opportunity", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-opportunity",
                systemId: "PLAYBOOK-SYSTEM-001", pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5,
                state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } });

        const result = await executor({ run, mission, report: () => undefined });

        expect(calls).toEqual(expect.arrayContaining([
            "inspect:agent/pbos-academic-parent",
            "read:91e42fd:app/opportunities/page.tsx",
            "read:91e42fd:components/opportunity-marketplace/OpportunityMarketplace.tsx",
            "files", "lock", "commit", "push", "pr-base:agent/pbos-academic-parent"
        ]));
        expect(generated.get("app/opportunities/page.tsx")).not.toContain("demoCourses");
        const route = generated.get("app/api/pbos/opportunities/route.ts") ?? "";
        expect(route).toContain("requireUser");
        expect(route).toContain("owner_id\", user.id");
        expect(route).not.toContain("ownerId?: unknown");
        expect(route).toContain("SignedPlaybookPbosTransport");
        expect(route).toContain("new PlaybookConnector(client)");
        expect(route).toContain('connector.registerIdentity(userId, "SCHOLAR")');
        expect(route).not.toContain('client.send("REGISTER_IDENTITY"');
        const marketplace = generated.get("components/opportunity-marketplace/OpportunityMarketplace.tsx") ?? "";
        expect(marketplace).toContain('role="status"');
        expect(marketplace).toContain('aria-label="Opportunity views"');
        expect(marketplace).toContain('decision: "SAVED" | "DISMISSED"');
        expect(marketplace).not.toContain("useCallback");
        expect(marketplace).toContain(".then(responseJson).then(body =>");
        const acceptance = generated.get("tests/acceptance/pbos-opportunity.spec.ts") ?? "";
        expect(acceptance).not.toContain('import { createClient } from "@supabase/supabase-js"');
        expect(acceptance).toContain("Opportunity discovery failed:");
        expect(acceptance).toContain('goalTitle: "Public Health"');
        expect(acceptance.indexOf("/api/pbos/scholar/onboarding"))
            .toBeLessThan(acceptance.indexOf('const discovery = await page.request.post("/api/pbos/opportunities")'));
        const migration = generated.get("supabase/migrations/202608050005_pbos_opportunity_journey.sql") ?? "";
        expect(migration).toContain("enable row level security");
        expect(migration).toContain("auth.uid() = owner_id");
        expect(generated.get("pbos/readiness/048-opportunity-journey.json")).toContain("IMPLEMENTED_PENDING_VALIDATION");
        expect(generated.get("tests/acceptance/pbos-opportunity.spec.ts")).toContain("READINESS-TO-OPPORTUNITY");
        expect(result.functionalAcceptancePlan).toMatchObject({ journeyId: "READINESS-TO-OPPORTUNITY",
            workingDirectory: "/tmp/playbook-opportunity", commit: generatedRevision });
        expect(result.deferredValidation?.pullRequestUrl).toContain("/pull/55");
        expect(new Set(result.acceptanceEvidence?.map(item => item.dimension))).toEqual(new Set([
            "ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION", "ACCEPTANCE_TEST",
            "ACCESSIBILITY", "SECURITY"
        ]));
        expect(result.acceptanceEvidence?.every(item => item.commit === generatedRevision && item.passed)).toBe(true);
    });

    it("refuses to overwrite a changed opportunity implementation", () => {
        expect(() => assertOpportunityBaseline("changed page", legacyMarketplace)).toThrow("re-inspect");
        expect(() => assertOpportunityBaseline(legacyPage, "changed marketplace")).toThrow("re-inspect");
    });

    it("repairs only the known connector bypass and adds sanitized API failure evidence", () => {
        const route = wireOpportunityIdentityIdempotency(legacyOpportunityRoute);
        expect(route).toContain('import { PlaybookConnector } from "@/pbos/connector/playbook-connector";');
        expect(route).toContain('connector.registerIdentity(userId, "SCHOLAR")');
        expect(route).not.toContain('client.send("REGISTER_IDENTITY"');
        expect(wireOpportunityIdentityIdempotency(route)).toBe(route);
        expect(wireOpportunityAcceptanceApiEvidence(legacyOpportunityAcceptance))
            .toContain("Opportunity discovery failed:");
        expect(() => wireOpportunityIdentityIdempotency("changed route")).toThrow("re-inspect");
    });

    it("adds a real Scholar goal before discovery without weakening explainable matching", () => {
        const governed = wireOpportunityAcceptanceJourneyContext(opportunityAcceptanceWithoutJourneyContext);
        expect(governed).toContain('displayName: "PBOS Acceptance Scholar", goalTitle: "Public Health"');
        expect(governed.indexOf("/api/pbos/scholar/onboarding"))
            .toBeLessThan(governed.indexOf("/api/pbos/opportunities"));
        expect(governed).toContain("toBeGreaterThan(0)");
        expect(wireOpportunityAcceptanceJourneyContext(governed)).toBe(governed);
        expect(() => wireOpportunityAcceptanceJourneyContext("changed acceptance"))
            .toThrow("re-inspect");
    });

    it("advances the existing blocked mission and pull request with one bounded repair", async () => {
        const calls: string[] = []; const changed = new Map<string, string>();
        const blocked = { ...run, status: "BLOCKED", selectedMission: "Complete readiness-to-opportunity journey",
            currentBranch: "agent/pbos-playbook-system-001-048-opportunity-12345678", currentCommit: "abcdef1",
            terminalSummary: "Functional application acceptance failed", blockers: [], evidenceIds: [] } as ProductionRun;
        expect(isOpportunityIdentityIdempotencyDefect(blocked, [
            "Browser journey command failed for READINESS-TO-OPPORTUNITY in pbos-opportunity.spec.ts Expected: 200 Received: 500"
        ])).toBe(true);
        const pullRequest = { url: "https://github.com/sgwalton87/playbook-platform/pull/61", number: 61,
            branch: blocked.currentBranch!, repository: "sgwalton87/playbook-platform" };
        const remediation = { runId: "replacement-validation", systemId: "PLAYBOOK-SYSTEM-001", pullRequest,
            headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS" as const,
            evidence: [], blockers: [], updatedAt: new Date().toISOString() };
        const gateway = {
            inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform",
                defaultBranch: blocked.currentBranch }, revision: blocked.currentCommit, findings: [], files: [], inspectedAt: new Date() }),
            readFileAtRevision: async (_reference: unknown, path: string) => path.includes("route.ts")
                ? legacyOpportunityRoute : legacyOpportunityAcceptance,
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => changed.set(file.path, file.content)); calls.push("apply"); return files.map(file => file.path);
            },
            commit: async () => { calls.push("commit"); return "abcdef2"; },
            push: async () => { calls.push("push"); }
        } as unknown as GitHubRepositoryGateway;
        const registered: unknown[][] = [];
        const prepared = await preparePlaybookOpportunityIdentityRecovery({ gateway, session, pullRequest,
            recoveryDefects: ["Identity mapping already registered: PLAYBOOK-IDENTITY-scholar"],
            authorize: action => ({ decisionId: action, grantId: "grant-opportunity", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (systemId, retained) => {
                expect(systemId).toBe("PLAYBOOK-SYSTEM-001"); expect(retained).toBe(pullRequest); return remediation;
            } },
            production: { registerBoundedRemediation: (...args: unknown[]) => { registered.push(args); return blocked; } }
        }, blocked);

        expect(calls).toEqual(["apply", "commit", "push"]);
        expect(prepared).toMatchObject({ branch: blocked.currentBranch, revision: "abcdef2",
            remediation: { runId: "replacement-validation", pullRequest } });
        expect(registered).toEqual([[blocked.runId, remediation.runId, blocked.currentBranch, "abcdef2",
            "OPPORTUNITY_IDENTITY_IDEMPOTENCY"]]);
        expect(changed.get("app/api/pbos/opportunities/route.ts")).toContain("connector.registerIdentity");
        expect(changed.get("tests/acceptance/pbos-opportunity.spec.ts")).toContain("Opportunity discovery failed:");
    });

    it("uses an active recovery epoch to advance the same opportunity PR with journey context", async () => {
        const calls: string[] = []; const changed = new Map<string, string>();
        const blocked = { ...run, status: "BLOCKED", selectedMission: "Complete readiness-to-opportunity journey",
            currentBranch: "agent/pbos-playbook-system-001-048-opportunity-12345678", currentCommit: "abcdef2",
            activeRecoveryEpochId: "epoch-1", terminalSummary: "Functional application acceptance failed",
            blockers: [], evidenceIds: ["remediation-run:validation-opportunity"] } as ProductionRun;
        const defect = "Browser journey command failed for READINESS-TO-OPPORTUNITY: expected value toBeGreaterThan 0; Received:   0";
        expect(isOpportunityJourneyContextDefect(blocked, [defect])).toBe(true);
        const pullRequest = { url: "https://github.com/sgwalton87/playbook-platform/pull/61", number: 61,
            branch: blocked.currentBranch!, repository: "sgwalton87/playbook-platform" };
        const remediation = { runId: "context-validation", systemId: "PLAYBOOK-SYSTEM-001", pullRequest,
            headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS" as const,
            evidence: [], blockers: [], updatedAt: new Date().toISOString() };
        const gateway = {
            inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform",
                defaultBranch: blocked.currentBranch }, revision: blocked.currentCommit, findings: [], files: [], inspectedAt: new Date() }),
            readFileAtRevision: async () => opportunityAcceptanceWithoutJourneyContext,
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => changed.set(file.path, file.content)); calls.push("apply"); return files.map(file => file.path);
            },
            commit: async () => { calls.push("commit"); return "abcdef3"; },
            push: async () => { calls.push("push"); }
        } as unknown as GitHubRepositoryGateway;
        const registered: unknown[][] = [];
        const prepared = await preparePlaybookOpportunityJourneyContextRecovery({ gateway, session, pullRequest,
            recoveryDefects: [defect],
            authorize: action => ({ decisionId: action, grantId: "grant-opportunity", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (systemId, retained) => {
                expect(systemId).toBe("PLAYBOOK-SYSTEM-001"); expect(retained).toBe(pullRequest); return remediation;
            } },
            production: { registerRecoveryRemediation: (...args: unknown[]) => { registered.push(args); return blocked; } }
        }, blocked);

        expect(calls).toEqual(["apply", "commit", "push"]);
        expect(prepared).toMatchObject({ branch: blocked.currentBranch, revision: "abcdef3",
            remediation: { runId: "context-validation", pullRequest } });
        expect(registered).toEqual([[blocked.runId, remediation.runId, blocked.currentBranch, "abcdef3",
            "OPPORTUNITY_JOURNEY_CONTEXT"]]);
        expect(changed.size).toBe(1);
        expect(changed.get("tests/acceptance/pbos-opportunity.spec.ts")).toContain('goalTitle: "Public Health"');
    });

    it("fails before repository inspection when authority is denied", async () => {
        const executor = playbookOpportunityJourneyExecutor({ gateway: {} as GitHubRepositoryGateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-opportunity", action, allowed: false,
                reason: "revoked", decidedAt: new Date() }),
            remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("denied: revoked");
    });
});
