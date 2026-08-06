import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { relative, resolve } from "path";
import { GenesisStateRepository } from "../genesis-state";

export const PLAYBOOK_SCHOLAR_STAGING_MIGRATIONS = [
    "supabase/migrations/202608050002_pbos_scholar_foundation.sql",
    "supabase/migrations/202608050003_pbos_scholar_dashboard.sql",
    "supabase/migrations/202608050004_pbos_academic_journey.sql"
] as const;

export const PLAYBOOK_SCHOLAR_STAGING_TABLES = [
    "scholar_profiles", "scholar_goals", "scholar_milestones", "scholar_dashboard_projections",
    "academic_journey_evidence"
] as const;

export interface PlaybookStagingMigrationDefinition {
    readonly missionId: "048-scholar-slice" | "048-opportunity-journey" | "048-application-journey" |
        "048-support-journey" | "048-messaging-journey" | "048-notification-journey";
    readonly label: string;
    readonly migrationPaths: readonly string[];
    readonly tableNames: readonly string[];
}

export const PLAYBOOK_STAGING_MIGRATION_DEFINITIONS: Readonly<Record<PlaybookStagingMigrationDefinition["missionId"],
    PlaybookStagingMigrationDefinition>> = {
    "048-scholar-slice": { missionId: "048-scholar-slice", label: "Scholar onboarding and academic foundation",
        migrationPaths: PLAYBOOK_SCHOLAR_STAGING_MIGRATIONS, tableNames: PLAYBOOK_SCHOLAR_STAGING_TABLES },
    "048-opportunity-journey": { missionId: "048-opportunity-journey", label: "readiness-to-opportunity journey",
        migrationPaths: ["supabase/migrations/202608050005_pbos_opportunity_journey.sql"],
        tableNames: ["pbos_opportunity_recommendations"] },
    "048-application-journey": { missionId: "048-application-journey", label: "opportunity-to-application journey",
        migrationPaths: ["supabase/migrations/202608050005_pbos_application_workspace_journey.sql"],
        tableNames: ["application_workspaces", "application_workspace_tasks", "application_workspace_documents", "application_workspace_events"] },
    "048-support-journey": { missionId: "048-support-journey", label: "application-to-authorized-support journey",
        migrationPaths: ["supabase/migrations/202608050007_pbos_application_support.sql"],
        tableNames: ["application_support_requests"] },
    "048-messaging-journey": { missionId: "048-messaging-journey", label: "governed support messaging journey",
        migrationPaths: ["supabase/migrations/202608050008_pbos_governed_messaging.sql"],
        tableNames: ["pbos_conversations", "pbos_conversation_participants", "pbos_messages"] },
    "048-notification-journey": { missionId: "048-notification-journey", label: "reliable notification outbox journey",
        migrationPaths: ["supabase/migrations/202608050009_pbos_notification_outbox.sql"],
        tableNames: ["pbos_notification_outbox", "pbos_notification_preferences", "notifications"] }
};

export function playbookStagingMigrationDefinition(missionId: string): PlaybookStagingMigrationDefinition | undefined {
    return PLAYBOOK_STAGING_MIGRATION_DEFINITIONS[missionId as PlaybookStagingMigrationDefinition["missionId"]];
}

export interface StagingMigrationPlan {
    readonly projectRef: string;
    readonly migrationPaths: readonly string[];
    readonly digests: readonly string[];
    readonly query: string;
}

export interface StagingMigrationResult {
    readonly migrationId: string;
    readonly projectRef: string;
    readonly repository: string;
    readonly branch: string;
    readonly commit: string;
    readonly migrationPaths: readonly string[];
    readonly digests: readonly string[];
    readonly appliedAt: string;
    readonly missionId: PlaybookStagingMigrationDefinition["missionId"];
}

export interface StagingSqlTransport {
    execute(projectRef: string, accessToken: string, query: string): Promise<void>;
}

export class SupabaseManagementSqlTransport implements StagingSqlTransport {
    constructor(private readonly fetcher: typeof fetch = fetch) {}

    async execute(projectRef: string, accessToken: string, query: string): Promise<void> {
        const response = await this.fetcher(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
            method: "POST",
            headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
            body: JSON.stringify({ query, read_only: false }),
            signal: AbortSignal.timeout(60_000)
        });
        let reportedError = false;
        try {
            const payload = await response.json() as { error?: unknown };
            reportedError = Boolean(payload.error);
        } catch { /* HTTP status remains authoritative. */ }
        if (!response.ok || reportedError) {
            throw new Error(`Supabase staging migration failed with HTTP ${response.status}; no secret or SQL response was persisted.`);
        }
    }
}

export class PlaybookStagingMigrationService {
    constructor(private readonly state: GenesisStateRepository,
        private readonly transport: StagingSqlTransport = new SupabaseManagementSqlTransport()) {}

    async plan(workingDirectory: string, projectRef: string,
        definition: PlaybookStagingMigrationDefinition = PLAYBOOK_STAGING_MIGRATION_DEFINITIONS["048-scholar-slice"]): Promise<StagingMigrationPlan> {
        if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("Supabase migration requires an exact project reference.");
        const root = resolve(workingDirectory);
        const migrations: string[] = [];
        const digests: string[] = [];
        for (const migrationPath of definition.migrationPaths) {
            const absolute = resolve(root, migrationPath);
            const inside = relative(root, absolute);
            if (!inside || inside.startsWith("..")) throw new Error(`Migration path escapes the governed repository: ${migrationPath}`);
            const sql = await readFile(absolute, "utf8");
            if (!sql.trim()) throw new Error(`Migration is empty: ${migrationPath}`);
            if (/\b(drop\s+table|truncate|delete\s+from|alter\s+table\s+[^;]+\s+drop\s+)\b/i.test(sql)) {
                throw new Error(`Destructive SQL is forbidden in the additive staging migration: ${migrationPath}`);
            }
            if (/\b(begin|commit|rollback)\s*;/i.test(sql)) {
                throw new Error(`Migration must not control its own transaction: ${migrationPath}`);
            }
            migrations.push(`-- ${migrationPath}\n${sql.trim()}`);
            digests.push(createHash("sha256").update(sql).digest("hex"));
        }
        const tableAssertions = definition.tableNames
            .map(table => `to_regclass('public.${table}') is null`).join(" or ");
        const verifyAndRefresh = `do $pbos$\nbegin\n  if ${tableAssertions} then\n` +
            `    raise exception 'PBOS staging migration did not create every governed table';\n` +
            `  end if;\nend\n$pbos$;\n\nnotify pgrst, 'reload schema';`;
        return { projectRef, migrationPaths: [...definition.migrationPaths], digests,
            query: `begin;\n${migrations.join("\n\n")}\n\n${verifyAndRefresh}\ncommit;` };
    }

    async apply(input: Readonly<{ workingDirectory: string; projectRef: string; accessToken: string;
        approvalId: string; actorId: string; repository: string; branch: string; commit: string;
        definition?: PlaybookStagingMigrationDefinition }>): Promise<StagingMigrationResult> {
        if (!input.accessToken.trim()) throw new Error("Supabase staging migration requires a protected management access token.");
        if (!input.approvalId.trim() || !input.actorId.trim()) throw new Error("Staging migration requires verifiable human approval.");
        if (!input.repository.includes("/") || !input.branch.startsWith("agent/") || !/^[a-f0-9]{7,40}$/i.test(input.commit)) {
            throw new Error("Staging migration requires exact governed repository lineage.");
        }
        const definition = input.definition ?? PLAYBOOK_STAGING_MIGRATION_DEFINITIONS["048-scholar-slice"];
        const plan = await this.plan(input.workingDirectory, input.projectRef, definition);
        await this.transport.execute(plan.projectRef, input.accessToken, plan.query);
        const result: StagingMigrationResult = { migrationId: randomUUID(), projectRef: plan.projectRef,
            repository: input.repository, branch: input.branch, commit: input.commit,
            migrationPaths: plan.migrationPaths, digests: plan.digests, appliedAt: new Date().toISOString(),
            missionId: definition.missionId };
        this.state.appendAudit({ eventId: result.migrationId, type: "STAGING_MIGRATION_APPLIED",
            actorId: input.actorId, resource: `supabase:${plan.projectRef}`, occurredAt: result.appliedAt,
            evidence: { approvalId: input.approvalId, repository: input.repository, branch: input.branch,
                commit: input.commit, migrationPaths: plan.migrationPaths, digests: plan.digests,
                missionId: definition.missionId, environment: "STAGING", transaction: "ATOMIC" } });
        return result;
    }
}
