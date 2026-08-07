import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { playbookMessagingJourneyExecutor } from "../playbook-messaging-journey-executor";

const session = { sessionId: "session-messaging", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook", domain: "Education",
        repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const, capabilities: [] },
    grant: { grantId: "grant", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform", branchPattern: "agent/*",
        mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } };
const run = { runId: "12345678-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingCommit: "abcdef1" } as ProductionRun;
const mission = { missionId: "048-messaging-journey", systemId: "PLAYBOOK-SYSTEM-001", title: "Complete governed support messaging journey",
    dependencies: ["048-support-journey"], status: "ACTIVE" as const, rationale: "Support is ready.", approvalRequired: true, evidenceIds: [] };

describe("CIP-048 governed messaging execution adapter", () => {
    it("replaces demo and browser-owned messaging with functional acceptance", async () => {
        const generated = new Map<string, string>(); const calls: string[] = [];
        const gateway = { inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            revision: "abcdef1", findings: [], files: [], inspectedAt: new Date() }),
        readFileAtRevision: async (_reference: unknown, path: string) => path === "package.json" ? '{"scripts":{"pbos:acceptance:prepare":"node prepare.mjs"}}'
            : path === ".env.example" ? "PBOS_API_URL=\n" : path.includes("InboxV2") ? "getDemoConversations()" : "getSupabaseAdmin(); body.scholarId",
        workingDirectory: async () => "/tmp/playbook-messaging",
        createBranch: async () => undefined, applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
            files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path); },
        prepareDependencyLock: async () => { calls.push("lock"); }, commit: async () => "message123", push: async () => undefined,
        openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/60", number: 60,
            branch: "agent/pbos-messaging", repository: "sgwalton87/playbook-platform" }) } as unknown as GitHubRepositoryGateway;
        const executor = playbookMessagingJourneyExecutor({ gateway, session, authorize: action => ({ decisionId: action, grantId: "grant",
            action, allowed: true, reason: "authorized", decidedAt: new Date() }), remediation: { start: (_systemId, pullRequest) => ({
                runId: "validation-message", systemId: "PLAYBOOK-SYSTEM-001", pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5,
                state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } });
        const result = await executor({ run, mission, report: () => undefined });
        expect(calls).toContain("lock");
        expect(generated.get("app/api/support-network/messages/route.ts")).toContain("requireUser");
        expect(generated.get("app/api/support-network/messages/route.ts")).not.toContain("body.scholarId");
        expect(generated.get("app/api/support-network/messages/route.ts")).toContain("authority.pbosRole");
        expect(generated.get("lib/pbos/governed-messaging.ts")).toContain("supporterRoleForRelationship");
        expect(generated.get("components/messages/InboxV2.tsx")).not.toContain("getDemoConversations");
        expect(generated.get("components/messages/InboxV2.tsx")).not.toContain('const load = useCallback(async () => { setLoading(true)');
        expect(generated.get("supabase/migrations/202608050008_pbos_governed_messaging.sql")).toContain("pbos_conversation_participants");
        expect(generated.get("supabase/migrations/202608050008_pbos_governed_messaging.sql")).toContain("Authorized actors join conversations");
        expect(generated.get("supabase/migrations/202608050008_pbos_governed_messaging.sql")).toContain("grant update (delivery_state,moderation_state,reported_at,provenance)");
        expect(generated.get("tests/acceptance/pbos-messaging.spec.ts")).toContain("AUTHORIZED-SUPPORT-MESSAGING");
        expect(result.functionalAcceptancePlan).toMatchObject({ journeyId: "AUTHORIZED-SUPPORT-MESSAGING",
            workingDirectory: "/tmp/playbook-messaging", commit: "message123" });
        expect(result.acceptanceEvidence?.some(item => item.dimension === "INDEPENDENT_VALIDATION")).toBe(false);
    });

    it("stops before inspection when messaging authority is denied", async () => {
        const executor = playbookMessagingJourneyExecutor({ gateway: {} as GitHubRepositoryGateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant", action, allowed: false, reason: "revoked", decidedAt: new Date() }),
            remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("denied: revoked");
    });
});
