import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname } from "path";
import { randomUUID } from "crypto";
import { InMemoryIntegrationStateRepository } from "./in-memory-integration-state-repository";
import { DurableIntegrationState, IntegrationTenantState } from "./contracts";
import { defaultIntegrationMigrations, emptyIntegrationState, IntegrationStateMigrationRegistry } from "./integration-state-core";

const dateKeys = new Set(["registeredAt", "updatedAt", "mappedAt", "occurredAt", "revokedAt", "recordedAt"]);
const revive = (text: string): DurableIntegrationState => JSON.parse(text, (key, value) =>
    dateKeys.has(key) && typeof value === "string" ? new Date(value) : value) as DurableIntegrationState;

export class FileIntegrationStateRepository extends InMemoryIntegrationStateRepository {
    private readonly lockPath: string;
    constructor(private readonly path: string, private readonly migrations: IntegrationStateMigrationRegistry = defaultIntegrationMigrations()) {
        super();
        this.lockPath = `${path}.lock`;
        this.state = this.readMigrated();
        if (existsSync(path) && this.state.schemaVersion !== revive(readFileSync(path, "utf8")).schemaVersion) this.persist(this.state);
    }

    override revision(): number { this.reload(); return super.revision(); }
    override connectors(organizationId: string) { this.reload(); return super.connectors(organizationId); }
    override domains(organizationId: string) { this.reload(); return super.domains(organizationId); }
    override identities(organizationId: string) { this.reload(); return super.identities(organizationId); }
    override events(organizationId: string, connectorId?: string) { this.reload(); return super.events(organizationId, connectorId); }
    override revocations(organizationId: string) { this.reload(); return super.revocations(organizationId); }
    override idempotency(organizationId: string, key: string) { this.reload(); return super.idempotency(organizationId, key); }
    override snapshot(): DurableIntegrationState { this.reload(); return super.snapshot(); }

    protected override change(organizationId: string, expectedRevision: number | undefined,
        update: (tenant: IntegrationTenantState) => IntegrationTenantState): void {
        this.withLock(() => {
            this.reload();
            super.change(organizationId, expectedRevision, update);
            this.persist(this.state);
        });
    }

    backup(targetPath: string): void {
        const snapshot = this.snapshot();
        mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 });
        writeFileSync(targetPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    }

    restore(backupPath: string): void {
        this.withLock(() => {
            this.reload();
            const restored = this.migrations.migrate(revive(readFileSync(backupPath, "utf8")));
            const promoted = { ...restored, revision: this.state.revision + 1 };
            this.persist(promoted);
            this.state = promoted;
        });
    }

    private reload(): void { this.state = this.readMigrated(); }
    private readMigrated(): DurableIntegrationState {
        if (!existsSync(this.path)) return emptyIntegrationState();
        return this.migrations.migrate(revive(readFileSync(this.path, "utf8")));
    }
    private persist(state: DurableIntegrationState): void {
        mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
        const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
        writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
        renameSync(temporary, this.path);
    }
    private withLock<T>(operation: () => T): T {
        mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
        let descriptor: number | undefined;
        for (let attempt = 0; attempt < 200; attempt += 1) {
            try { descriptor = openSync(this.lockPath, "wx", 0o600); break; }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
            }
        }
        if (descriptor === undefined) throw new Error("Timed out acquiring integration state lock.");
        try { return operation(); }
        finally { closeSync(descriptor); unlinkSync(this.lockPath); }
    }
}
