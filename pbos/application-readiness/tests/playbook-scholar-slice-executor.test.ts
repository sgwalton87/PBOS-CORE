import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { playbookScholarSliceExecutor, wireScholarOnboardingPage } from "../playbook-scholar-slice-executor";

const onboardingPage = `function StartContent() {
  const [created, setCreated] = useState(false);
  async function next() {
    if (isLast) {
      setCreating(true);
      await persist(true);
      setCreating(false);
      setCreated(true);
      setTimeout(() => {
        window.location.href = getOnboardingCompletionDestination(role);
      }, 15000);
      return;
    }
  }
  return (
    <main style={page}>
    </main>
  );
}`;

const session = {
    sessionId: "session-scholar", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
        domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const, capabilities: [] },
    grant: { grantId: "grant-scholar", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
        branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }
};
const run = { runId: "87654321-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingCommit: "72c68aa" } as ProductionRun;
const mission = { missionId: "048-scholar-slice", systemId: "PLAYBOOK-SYSTEM-001", title: "Complete Scholar onboarding-to-dashboard slice",
    dependencies: ["048-foundation"], status: "ACTIVE" as const, rationale: "Foundation complete.", approvalRequired: true, evidenceIds: [] };

describe("CIP-048 Scholar slice execution adapter", () => {
    it("wires accessible UI failure handling and refuses unknown source revisions", () => {
        const output = wireScholarOnboardingPage(onboardingPage);
        expect(output).toContain('/api/pbos/scholar/onboarding');
        expect(output).toContain('role="alert"');
        expect(output).toContain("setJourneyError");
        expect(() => wireScholarOnboardingPage("changed source")).toThrow("re-inspect");
    });

    it("publishes signed, durable Scholar journey code and begins validation", async () => {
        const calls: string[] = [];
        const generated = new Map<string, string>();
        const gateway = {
            inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
                revision: "72c68aa", findings: [], files: [], inspectedAt: new Date() }),
            readFileAtRevision: async (_reference: unknown, path: string, revision: string) => { calls.push(`read:${revision}:${path}`); return onboardingPage; },
            createBranch: async (_reference: unknown, branch: string) => { calls.push(`branch:${branch}`); return branch; },
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content));
                calls.push(`files:${files.map(file => file.path).join(",")}`); return files.map(file => file.path);
            },
            prepareDependencyLock: async () => { calls.push("lock"); },
            commit: async (_reference: unknown, _message: string, paths: readonly string[]) => { calls.push(`commit:${paths.join(",")}`); return "scholar123"; },
            push: async () => { calls.push("push"); },
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/53", number: 53,
                branch: "agent/pbos-playbook-system-001-048-scholar-87654321", repository: "sgwalton87/playbook-platform" })
        } as unknown as GitHubRepositoryGateway;
        const started: string[] = [];
        const executor = playbookScholarSliceExecutor({ gateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-scholar", action, allowed: true, reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-scholar", systemId: "PLAYBOOK-SYSTEM-001", pullRequest,
                headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) },
            startMonitor: validation => { started.push(validation.runId); } });
        const result = await executor({ run, mission, report: () => undefined });
        expect(calls).toContain("read:72c68aa:app/start/page.tsx");
        expect(calls.some(call => call.includes("app/api/pbos/scholar/onboarding/route.ts") &&
            call.includes("supabase/migrations/202608050003_pbos_scholar_dashboard.sql") &&
            call.includes(".env.example") && call.includes("docs/integrations/PBOS-SCHOLAR-ONBOARDING.md"))).toBe(true);
        expect(result.files?.modified).toContain("app/start/page.tsx");
        expect(result.deferredValidation?.pullRequestUrl).toContain("/pull/53");
        expect(generated.get(".env.example")).toContain("PBOS_CONNECTOR_SECRET_BASE64=");
        expect(generated.get(".env.example")).not.toContain("NEXT_PUBLIC_PBOS_CONNECTOR_SECRET");
        expect(generated.get("supabase/migrations/202608050003_pbos_scholar_dashboard.sql")).toContain("enable row level security");
        expect(generated.get("docs/integrations/PBOS-SCHOLAR-ONBOARDING.md")).toContain("without allowing the application to self-authorize");
        expect(started).toEqual(["validation-scholar"]);
    });

    it("fails closed before repository inspection when authority is denied", async () => {
        const executor = playbookScholarSliceExecutor({ gateway: {} as GitHubRepositoryGateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-scholar", action, allowed: false, reason: "revoked", decidedAt: new Date() }),
            remediation: { start: () => { throw new Error("not reached"); } }, startMonitor: () => undefined });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("denied: revoked");
    });
});
