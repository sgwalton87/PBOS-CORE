import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { relative, resolve } from "path";
import { GenesisStateRepository } from "../genesis-state";

export const PLAYBOOK_SCHOLAR_STAGING_MIGRATIONS = [
    "supabase/migrations/202608050002_pbos_scholar_foundation.sql",
    "supabase/migrations/202608050003_pbos_scholar_dashboard.sql"
] as const;

export const PLAYBOOK_SCHOLAR_STAGING_TABLES = [
    "scholar_profiles", "scholar_goals", "scholar_milestones", "scholar_dashboard_projections"
] as const;

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

    async plan(workingDirectory: string, projectRef: string): Promise<StagingMigrationPlan> {
        if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("Supabase migration requires an exact project reference.");
        const root = resolve(workingDirectory);
        const migrations: string[] = [];
        const digests: string[] = [];
        for (const migrationPath of PLAYBOOK_SCHOLAR_STAGING_MIGRATIONS) {
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
        const tableAssertions = PLAYBOOK_SCHOLAR_STAGING_TABLES
            .map(table => `to_regclass('public.${table}') is null`).join(" or ");
        const verifyAndRefresh = `do $pbos$\nbegin\n  if ${tableAssertions} then\n` +
            `    raise exception 'PBOS Scholar staging migration did not create every governed table';\n` +
            `  end if;\nend\n$pbos$;\n\nnotify pgrst, 'reload schema';`;
        return { projectRef, migrationPaths: [...PLAYBOOK_SCHOLAR_STAGING_MIGRATIONS], digests,
            query: `begin;\n${migrations.join("\n\n")}\n\n${verifyAndRefresh}\ncommit;` };
    }

    async apply(input: Readonly<{ workingDirectory: string; projectRef: string; accessToken: string;
        approvalId: string; actorId: string; repository: string; branch: string; commit: string }>): Promise<StagingMigrationResult> {
        if (!input.accessToken.trim()) throw new Error("Supabase staging migration requires a protected management access token.");
        if (!input.approvalId.trim() || !input.actorId.trim()) throw new Error("Staging migration requires verifiable human approval.");
        if (!input.repository.includes("/") || !input.branch.startsWith("agent/") || !/^[a-f0-9]{7,40}$/i.test(input.commit)) {
            throw new Error("Staging migration requires exact governed repository lineage.");
        }
        const plan = await this.plan(input.workingDirectory, input.projectRef);
        await this.transport.execute(plan.projectRef, input.accessToken, plan.query);
        const result: StagingMigrationResult = { migrationId: randomUUID(), projectRef: plan.projectRef,
            repository: input.repository, branch: input.branch, commit: input.commit,
            migrationPaths: plan.migrationPaths, digests: plan.digests, appliedAt: new Date().toISOString() };
        this.state.appendAudit({ eventId: result.migrationId, type: "STAGING_MIGRATION_APPLIED",
            actorId: input.actorId, resource: `supabase:${plan.projectRef}`, occurredAt: result.appliedAt,
            evidence: { approvalId: input.approvalId, repository: input.repository, branch: input.branch,
                commit: input.commit, migrationPaths: plan.migrationPaths, digests: plan.digests,
                environment: "STAGING", transaction: "ATOMIC" } });
        return result;
    }
}
