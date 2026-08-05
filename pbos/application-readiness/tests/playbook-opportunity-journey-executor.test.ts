import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import {
    assertOpportunityBaseline,
    playbookOpportunityJourneyExecutor
} from "../playbook-opportunity-journey-executor";

const legacyPage = `"use client";
const demoCourses = [];
export default function OpportunitiesPage() {
  return <OpportunityMarketplace courses={demoCourses} />;
}`;
const legacyMarketplace = `const [saved, setSaved] = useState<Record<string, boolean>>({});
const [statuses, setStatuses] = useState<Record<string, string>>({});`;

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
    repository: "sgwalton87/playbook-platform", startingCommit: "91e42fd" } as ProductionRun;
const mission = { missionId: "048-opportunity-journey", systemId: "PLAYBOOK-SYSTEM-001",
    title: "Complete readiness-to-opportunity journey", dependencies: ["048-academic-journey"], status: "ACTIVE" as const,
    rationale: "Academic evidence is ready.", approvalRequired: true, evidenceIds: [] };

describe("CIP-048 opportunity journey execution adapter", () => {
    it("replaces demo and browser-only behavior with owner-scoped durable PBOS functionality", async () => {
        const calls: string[] = [];
        const generated = new Map<string, string>();
        const generatedRevision = "abc1234def5678";
        const gateway = {
            inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
                revision: "91e42fd", findings: [], files: [], inspectedAt: new Date() }),
            readFileAtRevision: async (_reference: unknown, path: string, revision: string) => {
                calls.push(`read:${revision}:${path}`);
                return path === "app/opportunities/page.tsx" ? legacyPage : legacyMarketplace;
            },
            createBranch: async (_reference: unknown, branch: string) => { calls.push(`branch:${branch}`); return branch; },
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); calls.push("files"); return files.map(file => file.path);
            },
            prepareDependencyLock: async () => { calls.push("lock"); },
            commit: async () => { calls.push("commit"); return generatedRevision; },
            push: async () => { calls.push("push"); },
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/55", number: 55,
                branch: "agent/pbos-playbook-system-001-048-opportunity-12345678",
                repository: "sgwalton87/playbook-platform" })
        } as unknown as GitHubRepositoryGateway;
        const monitors: string[] = [];
        const executor = playbookOpportunityJourneyExecutor({ gateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-opportunity", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-opportunity",
                systemId: "PLAYBOOK-SYSTEM-001", pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5,
                state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) },
            startMonitor: validation => { monitors.push(validation.runId); } });

        const result = await executor({ run, mission, report: () => undefined });

        expect(calls).toEqual(expect.arrayContaining([
            "read:91e42fd:app/opportunities/page.tsx",
            "read:91e42fd:components/opportunity-marketplace/OpportunityMarketplace.tsx",
            "files", "lock", "commit", "push"
        ]));
        expect(generated.get("app/opportunities/page.tsx")).not.toContain("demoCourses");
        const route = generated.get("app/api/pbos/opportunities/route.ts") ?? "";
        expect(route).toContain("requireUser");
        expect(route).toContain("owner_id\", user.id");
        expect(route).not.toContain("ownerId?: unknown");
        expect(route).toContain("SignedPlaybookPbosTransport");
        const marketplace = generated.get("components/opportunity-marketplace/OpportunityMarketplace.tsx") ?? "";
        expect(marketplace).toContain('role="status"');
        expect(marketplace).toContain('aria-label="Opportunity views"');
        expect(marketplace).toContain('decision: "SAVED" | "DISMISSED"');
        const migration = generated.get("supabase/migrations/202608050005_pbos_opportunity_journey.sql") ?? "";
        expect(migration).toContain("enable row level security");
        expect(migration).toContain("auth.uid() = owner_id");
        expect(generated.get("pbos/readiness/048-opportunity-journey.json")).toContain("IMPLEMENTED_PENDING_VALIDATION");
        expect(result.deferredValidation?.pullRequestUrl).toContain("/pull/55");
        expect(new Set(result.acceptanceEvidence?.map(item => item.dimension))).toEqual(new Set([
            "ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION", "ACCEPTANCE_TEST",
            "ACCESSIBILITY", "SECURITY"
        ]));
        expect(result.acceptanceEvidence?.every(item => item.commit === generatedRevision && item.passed)).toBe(true);
        expect(monitors).toEqual(["validation-opportunity"]);
    });

    it("refuses to overwrite a changed opportunity implementation", () => {
        expect(() => assertOpportunityBaseline("changed page", legacyMarketplace)).toThrow("re-inspect");
        expect(() => assertOpportunityBaseline(legacyPage, "changed marketplace")).toThrow("re-inspect");
    });

    it("fails before repository inspection when authority is denied", async () => {
        const executor = playbookOpportunityJourneyExecutor({ gateway: {} as GitHubRepositoryGateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-opportunity", action, allowed: false,
                reason: "revoked", decidedAt: new Date() }),
            remediation: { start: () => { throw new Error("not reached"); } }, startMonitor: () => undefined });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("denied: revoked");
    });
});
