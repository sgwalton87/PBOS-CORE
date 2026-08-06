import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { playbookAcademicJourneyExecutor, wireTranscriptUploadCard } from "../playbook-academic-journey-executor";

const uploadCard = `import { supabase } from "@/lib/supabaseClient";
async function handleFile(file?: File) {
    if (!file) return;

    setBusy(true);
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;

    if (!userId) {
      setStatus("Please sign in first.");
      setBusy(false);
      return;
    }

    const base64 = await fileToBase64(file);
    await fetch("/api/parse-transcript", {
      body: JSON.stringify({ base64, mediaType: file.type || "application/pdf", userId }),
    });
}
return <p style={statusStyle}>{status}</p>;
`;

const session = {
    sessionId: "session-academic", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
        domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const, capabilities: [] },
    grant: { grantId: "grant-academic", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
        branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }
};
const run = { runId: "12345678-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingCommit: "836e6ae" } as ProductionRun;
const mission = { missionId: "048-academic-journey", systemId: "PLAYBOOK-SYSTEM-001", title: "Complete transcript-to-academic-readiness journey",
    dependencies: ["048-scholar-slice"], status: "ACTIVE" as const, rationale: "Scholar slice complete.", approvalRequired: true, evidenceIds: [] };

describe("CIP-048 academic journey execution adapter", () => {
    it("replaces browser-selected ownership with authenticated RLS and PBOS evidence", async () => {
        const calls: string[] = [];
        const generated = new Map<string, string>();
        const gateway = {
            inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
                revision: "836e6ae", findings: [], files: [], inspectedAt: new Date() }),
            readFileAtRevision: async (_reference: unknown, path: string, revision: string) => {
                calls.push(`read:${revision}:${path}`); return path.includes("TranscriptUploadCard") ? uploadCard : "legacy route";
            },
            createBranch: async (_reference: unknown, branch: string) => { calls.push(`branch:${branch}`); return branch; },
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); calls.push("files"); return files.map(file => file.path);
            },
            prepareDependencyLock: async () => { calls.push("lock"); },
            commit: async () => { calls.push("commit"); return "academic123"; },
            push: async () => { calls.push("push"); },
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/54", number: 54,
                branch: "agent/pbos-playbook-system-001-048-academic-12345678", repository: "sgwalton87/playbook-platform" })
        } as unknown as GitHubRepositoryGateway;
        const executor = playbookAcademicJourneyExecutor({ gateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-academic", action, allowed: true, reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-academic", systemId: "PLAYBOOK-SYSTEM-001", pullRequest,
                headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } });
        const result = await executor({ run, mission, report: () => undefined });
        expect(calls).toEqual(expect.arrayContaining(["read:836e6ae:app/api/parse-transcript/route.ts", "files", "lock", "commit", "push"]));
        const route = generated.get("app/api/parse-transcript/route.ts") ?? "";
        expect(route).toContain("requireUser");
        expect(route).toContain("user_id: user.id");
        expect(route).not.toContain("userId?: unknown");
        expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        const upload = generated.get("components/transcript/TranscriptUploadCard.tsx") ?? "";
        expect(upload).not.toContain("userId" );
        expect(upload).toContain('role="status"');
        expect(upload).toContain("12 MB or smaller");
        expect(generated.get("supabase/migrations/202608050004_pbos_academic_journey.sql")).toContain("enable row level security");
        expect(generated.get("pbos/readiness/048-academic-journey.json")).toContain("IMPLEMENTED_PENDING_VALIDATION");
        expect(result.files?.modified).toContain("app/api/parse-transcript/route.ts");
        expect(result.deferredValidation?.pullRequestUrl).toContain("/pull/54");
    });

    it("fails closed when the governed transcript UI no longer matches the inspected source", () => {
        expect(() => wireTranscriptUploadCard("changed component")).toThrow("re-inspect");
    });

    it("fails before repository inspection when authority is denied", async () => {
        const executor = playbookAcademicJourneyExecutor({ gateway: {} as GitHubRepositoryGateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-academic", action, allowed: false, reason: "revoked", decidedAt: new Date() }),
            remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("denied: revoked");
    });
});
