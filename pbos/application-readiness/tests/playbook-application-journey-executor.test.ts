import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ApplicationAcceptanceDimension, ProductionRun } from "../../production-runtime";
import {
    assertKnownApplicationWorkspaceSources,
    playbookApplicationJourneyExecutor
} from "../playbook-application-journey-executor";

const legacyRoute = `import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export async function POST(req: Request) { const body = await req.json(); return admin.from("application_workspaces").insert({ scholar_id: body.scholarId }); }
`;
const legacyDashboard = `const workspace = buildApplicationWorkspace({ scholarId: "scholar-maya", opportunityName: "Health Careers Internship" });`;

const session = {
    sessionId: "session-application", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
        domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const, capabilities: [] },
    grant: { grantId: "grant-application", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
        branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }
};
const run = { runId: "11223344-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingCommit: "91e42fd" } as ProductionRun;
const mission = { missionId: "048-application-journey", systemId: "PLAYBOOK-SYSTEM-001", title: "Complete opportunity-to-application journey",
    dependencies: ["048-opportunity-journey"], status: "ACTIVE" as const, rationale: "Opportunity journey complete.",
    approvalRequired: true, evidenceIds: [] };

describe("CIP-048 opportunity-to-application execution adapter", () => {
    it("replaces the unsafe demonstration with an owner-scoped durable application journey", async () => {
        const calls: string[] = [];
        const generated = new Map<string, string>();
        const gateway = {
            inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
                revision: "91e42fd", findings: [], files: [], inspectedAt: new Date() }),
            readFileAtRevision: async (_reference: unknown, path: string, revision: string) => {
                calls.push(`read:${revision}:${path}`);
                if (path === "package.json") return '{"scripts":{},"devDependencies":{}}';
                return path.includes("ApplicationWorkspaceDashboard") ? legacyDashboard : legacyRoute;
            },
            workingDirectory: async () => "/tmp/playbook-application",
            createBranch: async (_reference: unknown, branch: string) => { calls.push(`branch:${branch}`); return branch; },
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); calls.push("files"); return files.map(file => file.path);
            },
            prepareDependencyLock: async () => { calls.push("lock"); },
            commit: async () => { calls.push("commit"); return "application123"; },
            push: async () => { calls.push("push"); },
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/55", number: 55,
                branch: "agent/pbos-playbook-system-001-048-application-11223344", repository: "sgwalton87/playbook-platform" })
        } as unknown as GitHubRepositoryGateway;
        const executor = playbookApplicationJourneyExecutor({ gateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-application", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-application", systemId: "PLAYBOOK-SYSTEM-001",
                pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS",
                evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } });

        const result = await executor({ run, mission, report: () => undefined });

        expect(calls).toEqual(expect.arrayContaining([
            "read:91e42fd:app/api/application-workspaces/route.ts",
            "read:91e42fd:components/application-workspace/ApplicationWorkspaceDashboard.tsx",
            "files", "lock", "commit", "push"
        ]));
        const route = generated.get("app/api/application-workspaces/route.ts") ?? "";
        expect(route).toContain("requireUser");
        expect(route).toContain("ownerId: user.id");
        expect(route).not.toContain("body.scholarId");
        expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(route).toContain("PUBLISH_LIFECYCLE_EVENT");
        const documents = generated.get("app/api/application-workspaces/documents/route.ts") ?? "";
        expect(documents).toContain("MAX_DOCUMENT_BYTES");
        expect(documents).toContain('.eq("scholar_id", user.id)');
        const dashboard = generated.get("components/application-workspace/ApplicationWorkspaceDashboard.tsx") ?? "";
        expect(dashboard).toContain('role="status"');
        expect(dashboard).toContain('role="alert"');
        expect(dashboard).toContain("Mark application submitted");
        expect(generated.get("supabase/migrations/202608050005_pbos_application_workspace_journey.sql")).toContain("application_workspace_tasks enable row level security");
        expect(generated.get("supabase/migrations/202608050005_pbos_application_workspace_journey.sql")).toContain("public=false");
        expect(generated.get("pbos/readiness/048-application-journey.json")).toContain("IMPLEMENTED_PENDING_VALIDATION");
        const acceptance = generated.get("tests/acceptance/pbos-application.spec.ts") ?? "";
        expect(acceptance).toContain("OPPORTUNITY-TO-APPLICATION");
        expect(acceptance).toContain("expect(creation.status()).toBe(201)");
        expect(acceptance).toContain("records.workspaces?.some");
        expect(result.functionalAcceptancePlan).toMatchObject({ journeyId: "OPPORTUNITY-TO-APPLICATION",
            workingDirectory: "/tmp/playbook-application", commit: "application123" });
        expect(result.files?.modified).toContain("app/api/application-workspaces/route.ts");
        expect(result.deferredValidation?.pullRequestUrl).toContain("/pull/55");

        const expected: readonly ApplicationAcceptanceDimension[] = ["ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY",
            "PBOS_INTEGRATION", "ACCEPTANCE_TEST", "ACCESSIBILITY", "SECURITY"];
        expect(result.acceptanceEvidence?.map(item => item.dimension)).toEqual(expected);
        expect(result.acceptanceEvidence?.every(item => item.commit === "application123" && item.repository === "sgwalton87/playbook-platform")).toBe(true);
        expect(result.acceptanceEvidence?.some(item => item.dimension === "INDEPENDENT_VALIDATION")).toBe(false);
    });

    it("refuses to overwrite an unrecognized application implementation", () => {
        expect(() => assertKnownApplicationWorkspaceSources("secured route", legacyDashboard)).toThrow("re-inspect");
        expect(() => assertKnownApplicationWorkspaceSources(legacyRoute, "functional dashboard")).toThrow("re-inspect");
    });

    it("fails before repository inspection when application authority is denied", async () => {
        const executor = playbookApplicationJourneyExecutor({ gateway: {} as GitHubRepositoryGateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-application", action, allowed: false,
                reason: "revoked", decidedAt: new Date() }),
            remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("denied: revoked");
    });
});
