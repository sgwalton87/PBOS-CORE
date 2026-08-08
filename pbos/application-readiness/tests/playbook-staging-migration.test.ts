import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { inspectPlaybookScholarStagingReadiness, inspectPlaybookStagingMigrationReadiness,
    isAdditiveScholarMigrationEligible, waitForPlaybookScholarStagingReadiness } from "../playbook-functional-acceptance";
import { PLAYBOOK_STAGING_MIGRATION_DEFINITIONS, PlaybookStagingMigrationService, StagingSqlTransport } from "../playbook-staging-migration";

const protectedEnvironment = (): NodeJS.ProcessEnv => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service-role",
    PBOS_API_URL: "https://pbos.example.com/pbos/v1", PBOS_ORGANIZATION_ID: "PLAYBOOK-ORG-001",
    PBOS_CONNECTOR_ID: "PLAYBOOK-CONNECTOR-001", PBOS_CONNECTOR_KEY_ID: "key",
    PBOS_CONNECTOR_SECRET_BASE64: Buffer.alloc(32).toString("base64"),
    PBOS_SCHOLAR_IDENTITY_APPROVAL_ID: "identity-approval",
    PBOS_SCHOLAR_EXCHANGE_APPROVAL_ID: "exchange-approval",
    PBOS_ACCEPTANCE_EMAIL: "scholar@example.com", PBOS_ACCEPTANCE_PASSWORD: "password"
});

describe("governed Playbook staging migration", () => {
    it("reports every required Scholar resource without exposing protected values", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-staging-readiness-"));
        const ready = await inspectPlaybookScholarStagingReadiness(root, protectedEnvironment(), root,
            async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
        expect(ready.ready).toBe(true);
        expect(ready.resources.filter(item => item.resource.startsWith("table:"))).toHaveLength(5);
        expect(JSON.stringify(ready)).not.toContain("service-role");

        const blocked = await inspectPlaybookScholarStagingReadiness(root, protectedEnvironment(), root,
            async () => new Response(JSON.stringify({ code: "PGRST205" }), { status: 404,
                headers: { "content-type": "application/json" } }));
        expect(blocked.ready).toBe(false);
        expect(blocked.blockers).toContain("table:scholar_profiles:HTTP_404_PGRST205");
        expect(isAdditiveScholarMigrationEligible(blocked)).toBe(true);

        let table = 0;
        const partial = await inspectPlaybookScholarStagingReadiness(root, protectedEnvironment(), root,
            async () => ++table === 1
                ? new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
                : new Response(JSON.stringify({ code: "PGRST205" }), { status: 404,
                    headers: { "content-type": "application/json" } }));
        expect(isAdditiveScholarMigrationEligible(partial)).toBe(true);

        const migrationBlocked = await inspectPlaybookStagingMigrationReadiness(root, protectedEnvironment(), root);
        expect(migrationBlocked).toMatchObject({ ready: false, missing: ["SUPABASE_ACCESS_TOKEN"] });
        const migrationReady = await inspectPlaybookStagingMigrationReadiness(root,
            { ...protectedEnvironment(), SUPABASE_ACCESS_TOKEN: "protected-management-token" }, root);
        expect(migrationReady).toMatchObject({ ready: true, missing: [] });
        expect(JSON.stringify(migrationReady)).not.toContain("protected-management-token");
    });

    it("reports a malformed Supabase project URL as a blocker without attempting a network request", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-staging-invalid-url-"));
        let requests = 0;
        const readiness = await inspectPlaybookScholarStagingReadiness(root,
            { ...protectedEnvironment(), NEXT_PUBLIC_SUPABASE_URL: "not-a-url" }, root,
            async () => { requests += 1; return new Response("[]", { status: 200 }); });
        expect(readiness).toMatchObject({ ready: false,
            blockers: ["supabase-project:INVALID_PROJECT_URL"] });
        expect(requests).toBe(0);
    });

    it("applies the ordered migrations atomically and records only digests and approval lineage", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-staging-migration-"));
        const migrations = join(root, "supabase", "migrations");
        mkdirSync(migrations, { recursive: true });
        writeFileSync(join(migrations, "202608050002_pbos_scholar_foundation.sql"),
            "create table if not exists scholar_profiles (id uuid primary key);\n");
        writeFileSync(join(migrations, "202608050003_pbos_scholar_dashboard.sql"),
            "create table if not exists scholar_dashboard_projections (id uuid primary key);\n");
        writeFileSync(join(migrations, "202608050004_pbos_academic_journey.sql"),
            "create table if not exists academic_journey_evidence (id uuid primary key);\n");
        const calls: string[] = [];
        const transport: StagingSqlTransport = { execute: async (projectRef, token, query) => {
            calls.push(projectRef, token, query);
        } };
        const state = new GenesisStateRepository(join(root, "state.json"));
        const result = await new PlaybookStagingMigrationService(state, transport).apply({ workingDirectory: root,
            projectRef: "abcdefghijklmnopqrst", accessToken: "protected-token", approvalId: "approval-1", actorId: "operator-1",
            repository: "sgwalton87/playbook-platform", branch: "agent/scholar", commit: "abcdef1" });
        expect(calls[2]).toMatch(/^begin;/);
        expect(calls[2]).toContain("202608050002_pbos_scholar_foundation.sql");
        expect(calls[2]).toContain("202608050003_pbos_scholar_dashboard.sql");
        expect(calls[2]).toContain("202608050004_pbos_academic_journey.sql");
        expect(calls[2]).toContain("to_regclass('public.scholar_profiles')");
        expect(calls[2]).toContain("to_regclass('public.academic_journey_evidence')");
        expect(calls[2]).toContain("notify pgrst, 'reload schema'");
        expect(calls[2]).toMatch(/commit;$/);
        expect(result.migrationPaths).toHaveLength(3);
        expect(result.missionId).toBe("048-scholar-slice");
        const audit = state.audit().find(item => item.type === "STAGING_MIGRATION_APPLIED")!;
        expect(audit.evidence.approvalId).toBe("approval-1");
        expect(audit.evidence).toMatchObject({ repository: "sgwalton87/playbook-platform",
            branch: "agent/scholar", commit: "abcdef1" });
        expect(JSON.stringify(audit)).not.toContain("protected-token");
        expect(JSON.stringify(audit)).not.toContain("create table");
    });

    it("plans a bounded connected-journey migration without importing unrelated schema", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-opportunity-staging-"));
        const migrations = join(root, "supabase", "migrations");
        mkdirSync(migrations, { recursive: true });
        writeFileSync(join(migrations, "202608050005_pbos_opportunity_journey.sql"),
            "create table if not exists pbos_opportunity_recommendations (id uuid primary key);\n");
        const state = new GenesisStateRepository(join(root, "state.json"));
        const definition = PLAYBOOK_STAGING_MIGRATION_DEFINITIONS["048-opportunity-journey"];
        const plan = await new PlaybookStagingMigrationService(state, { execute: async () => undefined })
            .plan(root, "abcdefghijklmnopqrst", definition);
        expect(plan.migrationPaths).toEqual(["supabase/migrations/202608050005_pbos_opportunity_journey.sql"]);
        expect(plan.query).toContain("to_regclass('public.pbos_opportunity_recommendations')");
        expect(plan.query).not.toContain("scholar_profiles");

        const result = await new PlaybookStagingMigrationService(state, { execute: async () => undefined }).apply({
            workingDirectory: root, projectRef: "abcdefghijklmnopqrst", accessToken: "protected-token",
            approvalId: "approval-opportunity", actorId: "operator-1", repository: "sgwalton87/playbook-platform",
            branch: "agent/opportunity", commit: "abcdef2", definition
        });
        expect(result.missionId).toBe("048-opportunity-journey");
        expect(state.audit().at(-1)?.evidence).toMatchObject({ missionId: "048-opportunity-journey",
            commit: "abcdef2", migrationPaths: ["supabase/migrations/202608050005_pbos_opportunity_journey.sql"] });
    });

    it("orders the canonical support relationship prerequisite before support requests", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-support-staging-"));
        const migrations = join(root, "supabase", "migrations");
        mkdirSync(migrations, { recursive: true });
        writeFileSync(join(migrations, "20260704_support_relationships.sql"),
            "create table if not exists support_relationships (id uuid primary key);\n");
        writeFileSync(join(migrations, "202608050007_pbos_application_support.sql"),
            "create table if not exists application_support_requests (id uuid primary key);\n");
        const definition = PLAYBOOK_STAGING_MIGRATION_DEFINITIONS["048-support-journey"];
        const state = new GenesisStateRepository(join(root, "state.json"));
        const plan = await new PlaybookStagingMigrationService(state, { execute: async () => undefined })
            .plan(root, "abcdefghijklmnopqrst", definition);
        expect(plan.migrationPaths).toEqual([
            "supabase/migrations/20260704_support_relationships.sql",
            "supabase/migrations/202608050007_pbos_application_support.sql"
        ]);
        expect(plan.query.indexOf("20260704_support_relationships.sql"))
            .toBeLessThan(plan.query.indexOf("202608050007_pbos_application_support.sql"));
        expect(plan.query).toContain("to_regclass('public.support_relationships')");
        expect(plan.query).toContain("to_regclass('public.application_support_requests')");
    });

    it("registers isolated messaging and notification staging boundaries", () => {
        expect(PLAYBOOK_STAGING_MIGRATION_DEFINITIONS["048-support-journey"]).toMatchObject({
            migrationPaths: ["supabase/migrations/20260704_support_relationships.sql",
                "supabase/migrations/202608050007_pbos_application_support.sql"],
            tableNames: ["support_relationships", "application_support_requests"]
        });
        expect(PLAYBOOK_STAGING_MIGRATION_DEFINITIONS["048-messaging-journey"]).toMatchObject({
            migrationPaths: ["supabase/migrations/202608050008_pbos_governed_messaging.sql"],
            tableNames: ["pbos_conversations", "pbos_conversation_participants", "pbos_messages"]
        });
        expect(PLAYBOOK_STAGING_MIGRATION_DEFINITIONS["048-notification-journey"]).toMatchObject({
            migrationPaths: ["supabase/migrations/202608050009_pbos_notification_outbox.sql"],
            tableNames: ["pbos_notification_outbox", "pbos_notification_preferences", "notifications"]
        });
    });

    it("waits for PostgREST to reload its schema cache after the transaction commits", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-staging-schema-cache-"));
        let requests = 0;
        const waits: number[] = [];
        const readiness = await waitForPlaybookScholarStagingReadiness({ workingDirectory: root,
            environment: protectedEnvironment(), stateHome: root, maximumAttempts: 3,
            wait: async milliseconds => { waits.push(milliseconds); },
            fetcher: async () => {
                requests += 1;
                return requests <= 4
                    ? new Response(JSON.stringify({ code: "PGRST205" }), { status: 404,
                        headers: { "content-type": "application/json" } })
                    : new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
            } });
        expect(readiness.ready).toBe(true);
        expect(waits).toEqual([500]);
        expect(requests).toBe(10);
    });

    it("rejects destructive SQL before contacting staging", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-staging-destructive-"));
        const migrations = join(root, "supabase", "migrations");
        mkdirSync(migrations, { recursive: true });
        writeFileSync(join(migrations, "202608050002_pbos_scholar_foundation.sql"), "drop table scholar_profiles;\n");
        writeFileSync(join(migrations, "202608050003_pbos_scholar_dashboard.sql"), "select 1;\n");
        writeFileSync(join(migrations, "202608050004_pbos_academic_journey.sql"), "select 1;\n");
        const state = new GenesisStateRepository(join(root, "state.json"));
        await expect(new PlaybookStagingMigrationService(state, { execute: async () => undefined }).plan(root,
            "abcdefghijklmnopqrst")).rejects.toThrow("Destructive SQL");
    });
});
