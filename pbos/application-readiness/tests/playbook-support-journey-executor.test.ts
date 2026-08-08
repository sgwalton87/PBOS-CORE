import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { isSupportRelationshipMigrationFoundationDefect, makeSupportRelationshipMigrationIdempotent,
    playbookSupportJourneyExecutor, preparePlaybookSupportMigrationRecovery,
    wireApplicationSupportPanel } from "../playbook-support-journey-executor";

const dashboard = `import { PlaybookGrid, PlaybookPage } from "@/components/ui";
export default function ApplicationWorkspaceDashboard() {
  return <PlaybookPage><PlaybookGrid><p>Existing application workspace</p></PlaybookGrid>
    </PlaybookPage>;
}`;

const supportRelationships = `create table if not exists public.support_relationships (
  id uuid primary key default gen_random_uuid(),
  scholar_id uuid not null,
  permissions jsonb not null default '[]'::jsonb
);
create policy "Scholars can view their support relationships" on public.support_relationships for select using (true);
create policy "Supporters can view their scholar relationships" on public.support_relationships for select using (true);
create policy "Scholars can create support relationships" on public.support_relationships for insert with check (true);
`;

const session = {
    sessionId: "session-support", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
        domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const,
        capabilities: [] },
    grant: { grantId: "grant-support", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
        branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [],
        maximumRisk: "MEDIUM" as const, issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000) }
};
const run = { runId: "12345678-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingCommit: "836e6ae" } as ProductionRun;
const mission = { missionId: "048-support-journey", systemId: "PLAYBOOK-SYSTEM-001",
    title: "Complete application-to-support journey", dependencies: ["048-application-journey"], status: "ACTIVE" as const,
    rationale: "Application journey complete.", approvalRequired: true, evidenceIds: [],
    completionPolicy: { kind: "FUNCTIONAL_APPLICATION" as const,
        requiredDimensions: ["ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION",
            "ACCEPTANCE_TEST", "ACCESSIBILITY", "SECURITY", "INDEPENDENT_VALIDATION"] as const,
        acceptanceCriteria: ["A Scholar can request authorized application support."] } };

describe("CIP-048 application-to-support execution adapter", () => {
    it("publishes real owner- and relationship-authorized support behavior with typed acceptance evidence", async () => {
        const calls: string[] = [];
        const generated = new Map<string, string>();
        const gateway = {
            inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
                revision: "836e6ae", findings: [], files: [], inspectedAt: new Date() }),
            readFileAtRevision: async (_reference: unknown, path: string, revision: string) => {
                calls.push(`read:${revision}:${path}`);
                if (path.endsWith("ApplicationWorkspaceDashboard.tsx")) return dashboard;
                if (path.endsWith("20260704_support_relationships.sql")) return supportRelationships;
                if (path === ".env.example") return "PBOS_API_URL=\n";
                if (path === "package.json") return '{"scripts":{},"devDependencies":{}}';
                return "existing application-workspace route";
            },
            workingDirectory: async () => "/tmp/playbook-support",
            createBranch: async (_reference: unknown, branch: string) => { calls.push(`branch:${branch}`); return branch; },
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); calls.push("files"); return files.map(file => file.path);
            },
            prepareDependencyLock: async () => { calls.push("lock"); },
            commit: async () => { calls.push("commit"); return "support123"; },
            push: async () => { calls.push("push"); },
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/57", number: 57,
                branch: "agent/pbos-playbook-system-001-048-support-12345678", repository: "sgwalton87/playbook-platform" })
        } as unknown as GitHubRepositoryGateway;
        const executor = playbookSupportJourneyExecutor({ gateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-support", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-support", systemId: "PLAYBOOK-SYSTEM-001",
                pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS", evidence: [],
                blockers: [], updatedAt: new Date().toISOString() }) } });
        const result = await executor({ run, mission, report: () => undefined });

        expect(calls).toEqual(expect.arrayContaining([
            "read:836e6ae:app/api/application-workspaces/route.ts",
            "read:836e6ae:components/application-workspace/ApplicationWorkspaceDashboard.tsx", "files", "lock", "commit", "push"
        ]));
        const route = generated.get("app/api/pbos/application-support/route.ts") ?? "";
        expect(route).toContain("requireUser");
        expect(route).toContain('.eq("scholar_id", user.id)');
        expect(route).toContain("PBOS_SUPPORT_REQUEST_APPROVAL_ID");
        expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(route).toContain("new PlaybookConnector(client)");
        expect(route).toContain('connector.registerIdentity(userId, "SCHOLAR")');
        expect(route).not.toContain('client.send("REGISTER_IDENTITY"');
        const service = generated.get("lib/pbos/application-support-request.ts") ?? "";
        expect(service).toContain('permissions.includes("support_tasks")');
        expect(service).toContain("authorizePlaybookFoundation");
        const panel = generated.get("components/application-workspace/ApplicationSupportRequestPanel.tsx") ?? "";
        expect(panel).toContain('role="status"');
        expect(panel).toContain('role="alert"');
        expect(panel).not.toContain("scholar-maya");
        expect(panel).not.toContain('const load = useCallback(async () => {\n    setLoading(true)');
        expect(panel).not.toContain("useCallback");
        expect(panel).toContain("fetchSupportContext().then(result =>");
        expect(generated.get("supabase/migrations/202608050007_pbos_application_support.sql")).toContain("enable row level security");
        expect(generated.get("supabase/migrations/20260704_support_relationships.sql"))
            .toContain('drop policy if exists "Scholars can view their support relationships"');
        expect(generated.get("pbos/readiness/048-support-journey.json")).toContain("IMPLEMENTED_PENDING_VALIDATION");
        const acceptance = generated.get("tests/acceptance/pbos-support.spec.ts") ?? "";
        expect(acceptance).toContain("APPLICATION-TO-AUTHORIZED-SUPPORT");
        expect(acceptance).toContain("expect(request.status()).toBe(201)");
        expect(acceptance).toContain("existingRelationship");
        expect(acceptance).not.toContain('.delete().eq("scholar_id"');
        expect(result.functionalAcceptancePlan).toMatchObject({ journeyId: "APPLICATION-TO-AUTHORIZED-SUPPORT",
            workingDirectory: "/tmp/playbook-support", commit: "support123" });
        expect(result.acceptanceEvidence?.map(item => item.dimension)).toEqual(expect.arrayContaining([
            "ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION", "ACCEPTANCE_TEST",
            "ACCESSIBILITY", "SECURITY"
        ]));
        expect(result.acceptanceEvidence?.every(item => item.commit === "support123")).toBe(true);
        expect(result.acceptanceEvidence?.some(item => item.dimension === "INDEPENDENT_VALIDATION")).toBe(false);
        expect(result.deferredValidation?.pullRequestUrl).toContain("/pull/57");
    });

    it("preserves the application workspace and refuses unrecognized source", () => {
        const wired = wireApplicationSupportPanel(dashboard);
        expect(wired).toContain("Existing application workspace");
        expect(wired).toContain("<ApplicationSupportRequestPanel />");
        expect(() => wireApplicationSupportPanel("changed dashboard")).toThrow("re-inspect");
    });

    it("makes the canonical support relationship migration replay-safe and fails closed on drift", () => {
        const wired = makeSupportRelationshipMigrationIdempotent(supportRelationships);
        expect(wired.match(/drop policy if exists/g)).toHaveLength(3);
        expect(makeSupportRelationshipMigrationIdempotent(wired)).toBe(wired);
        expect(() => makeSupportRelationshipMigrationIdempotent("select 1;")).toThrow("re-inspect");
    });

    it("repairs the missing staging prerequisite on the existing mission and pull request", async () => {
        const generated = new Map<string, string>();
        const calls: string[] = [];
        const pullRequest = { url: "https://github.com/sgwalton87/playbook-platform/pull/63", number: 63,
            branch: "agent/pbos-playbook-system-001-048-support-4559aabf", repository: "sgwalton87/playbook-platform" };
        const blockedRun = { ...run, status: "BLOCKED", currentBranch: pullRequest.branch, currentCommit: "11860f1",
            selectedMission: "Complete application-to-support journey",
            terminalSummary: "Supabase staging migration failed with HTTP 400", blockers: [], evidenceIds: [] } as ProductionRun;
        const gateway = {
            inspectRepository: async () => ({ revision: "11860f1" }),
            readFileAtRevision: async () => supportRelationships,
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path);
            },
            commit: async () => "supportfix1",
            push: async () => { calls.push("push"); }
        } as unknown as GitHubRepositoryGateway;
        const result = await preparePlaybookSupportMigrationRecovery({ gateway, session, pullRequest,
            recoveryDefects: ["Supabase staging migration failed with HTTP 400"],
            authorize: action => ({ decisionId: action, grantId: "grant-support", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }),
            remediation: { start: () => ({ runId: "validation-support-fix", systemId: "PLAYBOOK-SYSTEM-001",
                pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS",
                evidence: [], blockers: [], updatedAt: new Date().toISOString() }) },
            production: { registerBoundedRemediation: (_runId, _remediationId, _branch, revision, classification) => {
                calls.push(`${revision}:${classification}`); return blockedRun;
            } } }, blockedRun);
        expect(result.revision).toBe("supportfix1");
        expect(calls).toContain("supportfix1:SUPPORT_RELATIONSHIP_MIGRATION_FOUNDATION");
        expect(generated.get("supabase/migrations/20260704_support_relationships.sql"))
            .toContain("drop policy if exists");
        expect(isSupportRelationshipMigrationFoundationDefect(blockedRun)).toBe(true);
    });

    it("fails before repository inspection when the governed grant denies mutation", async () => {
        const executor = playbookSupportJourneyExecutor({ gateway: {} as GitHubRepositoryGateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-support", action, allowed: false,
                reason: "revoked", decidedAt: new Date() }),
            remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("denied: revoked");
    });
});
