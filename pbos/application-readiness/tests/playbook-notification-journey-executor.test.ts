import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { isNotificationAccessibilityContrastDefect, isNotificationReadStateContrastDefect, isNotificationSchemaDriftDefect, playbookNotificationJourneyExecutor,
    preparePlaybookNotificationAccessibilityRecovery, preparePlaybookNotificationSchemaRecovery,
    wireNotificationAccessibilityContrast, wireNotificationStorageIsolation } from "../playbook-notification-journey-executor";

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
        expect(generated.get("app/api/notifications/route.ts")).toContain('.from("pbos_notifications")');
        expect(generated.get("app/api/notifications/route.ts")).not.toContain('.from("notifications")');
        expect(generated.get("app/api/notifications/route.ts")).toContain("DIGEST_QUEUED");
        expect(generated.get("app/api/notifications/route.ts")).toContain("notificationType");
        expect(generated.get("app/api/notifications/route.ts")).toContain("digestQueued: true, idempotent: true");
        expect(generated.get("components/notifications-v2/NotificationCenter.tsx")).not.toContain("getDemoNotifications");
        expect(generated.get("components/notifications-v2/NotificationCenter.tsx")).not.toContain('const load=useCallback(async()=>{setLoading(true)');
        expect(generated.get("components/notifications-v2/NotificationCenter.tsx")).not.toContain("useCallback");
        expect(generated.get("components/notifications-v2/NotificationCenter.tsx")).toContain("fetchNotifications().then(result=>");
        expect(generated.get("components/notifications-v2/NotificationCenter.tsx"))
            .toContain('aria-live="polite" style={{color:"#0F172A"}}');
        expect(generated.get("components/notifications-v2/NotificationCenter.tsx"))
            .toContain('style={{color:"#1D4ED8"}}>Open</Link>');
        expect(generated.get("components/notifications-v2/NotificationCenter.tsx")).not.toContain("PlaybookPill");
        expect(generated.get("supabase/migrations/202608050009_pbos_notification_outbox.sql"))
            .toContain("create table if not exists public.pbos_notifications");
        expect(generated.get("supabase/migrations/202608050009_pbos_notification_outbox.sql"))
            .not.toContain("alter table public.notifications");
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

    it("repairs live notification schema drift on the existing mission and pull request", async () => {
        const legacyRoute = 'const saved = await supabase.from("notifications").upsert({ user_id: userId });';
        const legacyMigration = "alter table public.notifications add column if not exists source_event_key text;\n";
        const isolated = wireNotificationStorageIsolation(legacyRoute, legacyMigration);
        expect(isolated.route).toContain('.from("pbos_notifications")');
        expect(isolated.migration).toContain("create table if not exists public.pbos_notifications");
        expect(isolated.migration).not.toContain("alter table public.notifications");

        const pullRequest = { url: "https://github.com/sgwalton87/playbook-platform/pull/65", number: 65,
            branch: "agent/pbos-playbook-system-001-048-notifications-73e6a99a", repository: "sgwalton87/playbook-platform" };
        const defect = "Supabase staging migration failed with HTTP 400; no secret or SQL response was persisted.";
        const blockedRun = { ...run, status: "BLOCKED", currentBranch: pullRequest.branch, currentCommit: "notifyold",
            selectedMission: "Complete reliable notification journey", terminalSummary: defect, blockers: [defect], evidenceIds: [] } as ProductionRun;
        const generated = new Map<string, string>();
        const gateway = { inspectRepository: async () => ({ revision: "notifyold" }),
            readFileAtRevision: async (_reference: unknown, path: string) => path === "app/api/notifications/route.ts"
                ? legacyRoute : legacyMigration,
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path);
            }, commit: async () => "notifynew", push: async () => undefined } as unknown as GitHubRepositoryGateway;
        const result = await preparePlaybookNotificationSchemaRecovery({ gateway, session, pullRequest,
            recoveryDefects: [defect], authorize: action => ({ decisionId: action, grantId: "grant", action,
                allowed: true, reason: "authorized", decidedAt: new Date() }),
            remediation: { start: () => ({ runId: "validation-notification-recovery", systemId: "PLAYBOOK-SYSTEM-001",
                pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS",
                evidence: [], blockers: [], updatedAt: new Date().toISOString() }) },
            production: { registerBoundedRemediation: () => blockedRun } }, blockedRun);
        expect(result.revision).toBe("notifynew");
        expect(generated.get("app/api/notifications/route.ts")).toContain("pbos_notifications");
        expect(generated.get("supabase/migrations/202608050009_pbos_notification_outbox.sql"))
            .toContain("pbos_notifications");
        expect(isNotificationSchemaDriftDefect(blockedRun, [defect])).toBe(true);
    });

    it("repairs only the axe-proven notification contrast on the existing pull request", async () => {
        const center = `import { PlaybookHero, PlaybookMetric, PlaybookMetrics, PlaybookPage, PlaybookPill } from "@/components/ui";
<p role="status" aria-live="polite">Notification state is current.</p>
<section aria-label="Notification preferences"><h2>Delivery preferences</h2><label key={type} style={{display:"block"}}>{type}</label></section>
<section><div style={{display:"flex",gap:8,flexWrap:"wrap"}}></div><p>Nothing needs attention in this view.</p>
<article key={item.id} style={{padding:16,borderBottom:"1px solid #E2E8F0",opacity:item.read?.7:1}}>
<PlaybookPill>{item.type}</PlaybookPill><h2>{item.title}</h2><p>{item.body}</p><Link href={item.href}>Open</Link>
<small>{item.priority} priority · {new Date(item.created_at).toLocaleString()}</small></article></section>`;
        const accessible = wireNotificationAccessibilityContrast(center);
        expect(accessible).toContain('aria-live="polite" style={{color:"#0F172A"}}');
        expect(accessible).toContain('style={{color:"#1D4ED8"}}>Open</Link>');
        expect(accessible).toContain('color:"#7C2D12"');
        expect(accessible).toContain("data-read={item.read}");
        expect(accessible).not.toContain("opacity:item.read?.7:1");
        expect(accessible).not.toContain("PlaybookPill");
        const faded = accessible.replace('data-read={item.read} style={{padding:16,borderBottom:"1px solid #E2E8F0",color:"#0F172A"}}>',
            'style={{padding:16,borderBottom:"1px solid #E2E8F0",opacity:item.read?.7:1,color:"#0F172A"}}>');
        expect(wireNotificationAccessibilityContrast(faded)).not.toContain("opacity:item.read?.7:1");
        expect(wireNotificationAccessibilityContrast(accessible)).toBe(accessible);

        const pullRequest = { url: "https://github.com/sgwalton87/playbook-platform/pull/65", number: 65,
            branch: "agent/pbos-playbook-system-001-048-notifications-73e6a99a", repository: "sgwalton87/playbook-platform" };
        const defect = 'Browser journey command failed for EVENT-TO-ACKNOWLEDGED-NOTIFICATION "id": "color-contrast" Notification state is current #ffffff #f8f7f4';
        const blockedRun = { ...run, status: "BLOCKED", currentBranch: pullRequest.branch, currentCommit: "notifyschema",
            selectedMission: "Complete reliable notification journey", terminalSummary: defect, blockers: [defect], evidenceIds: [] } as ProductionRun;
        let written = "";
        const gateway = { inspectRepository: async () => ({ revision: "notifyschema" }),
            readFileAtRevision: async () => center,
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                written = files[0]!.content; return files.map(file => file.path);
            }, commit: async () => "notifyaccessible", push: async () => undefined } as unknown as GitHubRepositoryGateway;
        const result = await preparePlaybookNotificationAccessibilityRecovery({ gateway, session, pullRequest,
            recoveryDefects: [defect], authorize: action => ({ decisionId: action, grantId: "grant", action,
                allowed: true, reason: "authorized", decidedAt: new Date() }),
            remediation: { start: () => ({ runId: "validation-notification-accessibility", systemId: "PLAYBOOK-SYSTEM-001",
                pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS",
                evidence: [], blockers: [], updatedAt: new Date().toISOString() }) },
            production: { registerBoundedRemediation: () => blockedRun } }, blockedRun);
        expect(result.revision).toBe("notifyaccessible");
        expect(written).toContain('color:"#0F172A"');
        expect(isNotificationAccessibilityContrastDefect(blockedRun, [defect])).toBe(true);
        const opacityDefect = 'Browser journey command failed for EVENT-TO-ACKNOWLEDGED-NOTIFICATION "id": "color-contrast" #a16a56 #fdf7ef article > span';
        expect(isNotificationReadStateContrastDefect({ ...blockedRun, terminalSummary: opacityDefect,
            blockers: [opacityDefect] } as ProductionRun, [opacityDefect])).toBe(true);
    });
});
