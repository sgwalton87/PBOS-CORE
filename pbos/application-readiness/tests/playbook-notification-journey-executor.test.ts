import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { playbookNotificationJourneyExecutor } from "../playbook-notification-journey-executor";

const session = { sessionId: "session-notification", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook", domain: "Education",
        repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const, capabilities: [] },
    grant: { grantId: "grant", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform", branchPattern: "agent/*",
        mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } };
const run = { runId: "87654321-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingCommit: "bcdef12" } as ProductionRun;
const mission = { missionId: "048-notification-journey", systemId: "PLAYBOOK-SYSTEM-001", title: "Complete reliable notification journey",
    dependencies: ["048-messaging-journey"], status: "ACTIVE" as const, rationale: "Messaging is ready.", approvalRequired: true, evidenceIds: [] };

describe("CIP-048 reliable notification execution adapter", () => {
    it("replaces demo fallback with an idempotent outbox and executable acceptance", async () => {
        const generated = new Map<string, string>();
        const gateway = { inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            revision: "bcdef12", findings: [], files: [], inspectedAt: new Date() }),
        readFileAtRevision: async (_reference: unknown, path: string) => path === "package.json" ? '{"scripts":{"pbos:acceptance:prepare":"node prepare.mjs"}}'
            : path === ".env.example" ? "PBOS_API_URL=\n" : path.includes("NotificationCenter") ? "getDemoNotifications(); // Keep demo notifications."
                : "getSupabaseAdmin()",
        workingDirectory: async () => "/tmp/playbook-notifications", createBranch: async () => undefined,
        applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
            files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path); },
        prepareDependencyLock: async () => undefined, commit: async () => "notify123", push: async () => undefined,
        openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/61", number: 61,
            branch: "agent/pbos-notifications", repository: "sgwalton87/playbook-platform" }) } as unknown as GitHubRepositoryGateway;
        const executor = playbookNotificationJourneyExecutor({ gateway, session, authorize: action => ({ decisionId: action, grantId: "grant",
            action, allowed: true, reason: "authorized", decidedAt: new Date() }), remediation: { start: (_systemId, pullRequest) => ({
                runId: "validation-notification", systemId: "PLAYBOOK-SYSTEM-001", pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5,
                state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } });
        const result = await executor({ run, mission, report: () => undefined });
        expect(generated.get("app/api/notifications/route.ts")).toContain("pbos_notification_outbox");
        expect(generated.get("app/api/notifications/route.ts")).toContain("DIGEST_QUEUED");
        expect(generated.get("app/api/notifications/route.ts")).toContain("notificationType");
        expect(generated.get("app/api/notifications/route.ts")).toContain("digestQueued: true, idempotent: true");
        expect(generated.get("components/notifications-v2/NotificationCenter.tsx")).not.toContain("getDemoNotifications");
        expect(generated.get("components/notifications-v2/NotificationCenter.tsx")).not.toContain('const load=useCallback(async()=>{setLoading(true)');
        expect(generated.get("supabase/migrations/202608050009_pbos_notification_outbox.sql")).toContain("source_event_key");
        expect(generated.get("tests/acceptance/pbos-notifications.spec.ts")).toContain("EVENT-TO-ACKNOWLEDGED-NOTIFICATION");
        expect(result.functionalAcceptancePlan).toMatchObject({ journeyId: "EVENT-TO-ACKNOWLEDGED-NOTIFICATION",
            workingDirectory: "/tmp/playbook-notifications", commit: "notify123" });
        expect(result.acceptanceEvidence?.some(item => item.dimension === "INDEPENDENT_VALIDATION")).toBe(false);
    });

    it("stops before inspection when notification authority is denied", async () => {
        const executor = playbookNotificationJourneyExecutor({ gateway: {} as GitHubRepositoryGateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant", action, allowed: false, reason: "revoked", decidedAt: new Date() }),
            remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("denied: revoked");
    });
});
