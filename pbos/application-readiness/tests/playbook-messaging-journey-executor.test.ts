import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { isMessagingLeastPrivilegeDefect, playbookMessagingJourneyExecutor,
    preparePlaybookMessagingLeastPrivilegeRecovery, repairMessagingLeastPrivilegeBoundary } from "../playbook-messaging-journey-executor";

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
        expect(generated.get("components/messages/InboxV2.tsx")).not.toContain("useCallback");
        expect(generated.get("components/messages/InboxV2.tsx")).toContain("fetchConversations().then(result =>");
        expect(generated.get("supabase/migrations/202608050008_pbos_governed_messaging.sql")).toContain("pbos_conversation_participants");
        expect(generated.get("supabase/migrations/202608050008_pbos_governed_messaging.sql")).toContain("Authorized actors join conversations");
        expect(generated.get("supabase/migrations/202608050008_pbos_governed_messaging.sql")).toContain("grant update (delivery_state,moderation_state,reported_at,provenance)");
        expect(generated.get("supabase/migrations/202608050008_pbos_governed_messaging.sql"))
            .toContain("grant select, insert on public.pbos_messages");
        expect(generated.get("app/api/support-network/messages/route.ts")).toContain("ignoreDuplicates: true");
        expect(generated.get("app/api/support-network/messages/route.ts")).toContain("stagedMessage");
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

    it("repairs the messaging permission boundary on the existing mission and pull request", async () => {
        const route = `const staged = await supabase.from("pbos_messages").upsert({}, { onConflict: "idempotency_key" }).select("id,conversation_id,sender_id,body,created_at").single();
    if (staged.error || !staged.data) throw new Error(staged.error?.message ?? "Message persistence failed.");
    const payload = staged.data.id;`;
        const migration = "revoke update on public.pbos_messages from authenticated;";
        const fixed = repairMessagingLeastPrivilegeBoundary(route, migration);
        expect(fixed.route).toContain("ignoreDuplicates: true");
        expect(fixed.route).toContain("stagedMessage.id");
        expect(fixed.migration).toContain("grant select, insert on public.pbos_messages");
        expect(repairMessagingLeastPrivilegeBoundary(fixed.route, fixed.migration)).toEqual(fixed);

        const pullRequest = { url: "https://github.com/sgwalton87/playbook-platform/pull/64", number: 64,
            branch: "agent/pbos-playbook-system-001-048-messaging-f043cf27", repository: "sgwalton87/playbook-platform" };
        const blockedRun = { ...run, status: "BLOCKED", currentBranch: pullRequest.branch, currentCommit: "5456c99",
            selectedMission: "Complete governed support messaging journey", blockers: [], evidenceIds: [],
            terminalSummary: "pbos-messaging.spec.ts Expected: 201 Received: 500" } as ProductionRun;
        const generated = new Map<string, string>();
        const gateway = { inspectRepository: async () => ({ revision: "5456c99" }),
            readFileAtRevision: async (_reference: unknown, path: string) => path.includes("route.ts") ? route : migration,
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path);
            }, commit: async () => "messagefix", push: async () => undefined } as unknown as GitHubRepositoryGateway;
        const result = await preparePlaybookMessagingLeastPrivilegeRecovery({ gateway, session, pullRequest,
            recoveryDefects: [blockedRun.terminalSummary!],
            authorize: action => ({ decisionId: action, grantId: "grant", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }),
            remediation: { start: () => ({ runId: "validation-message-fix", systemId: "PLAYBOOK-SYSTEM-001",
                pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS",
                evidence: [], blockers: [], updatedAt: new Date().toISOString() }) },
            production: { registerBoundedRemediation: () => blockedRun } }, blockedRun);
        expect(result.revision).toBe("messagefix");
        expect(generated.get("app/api/support-network/messages/route.ts")).toContain("ignoreDuplicates: true");
        expect(isMessagingLeastPrivilegeDefect(blockedRun)).toBe(true);
    });
});
