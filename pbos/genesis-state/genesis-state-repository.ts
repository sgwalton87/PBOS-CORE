import { AutonomousBuildGrant } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GenesisSystemDefinition } from "../genesis-console/system-definition";
import { SystemBlueprint } from "../system-blueprint";
import { JsonStateStore } from "./json-state-store";

export interface GenesisAuditEvent {
    readonly eventId: string;
    readonly type: string;
    readonly actorId: string;
    readonly resource: string;
    readonly occurredAt: string;
    readonly evidence: Readonly<Record<string, unknown>>;
}

interface DurableGenesisState {
    readonly systems: readonly GenesisSystemDefinition[];
    readonly blueprints: readonly unknown[];
    readonly sessions: readonly unknown[];
    readonly grants: readonly unknown[];
    readonly audit: readonly GenesisAuditEvent[];
}

const dateKeys = new Set(["createdAt", "activatedAt", "issuedAt", "expiresAt", "revokedAt", "decidedAt", "requestedAt"]);
const revive = <T>(value: unknown): T => JSON.parse(JSON.stringify(value), (key, item) =>
    dateKeys.has(key) && typeof item === "string" ? new Date(item) : item) as T;

export class GenesisStateRepository {
    private readonly store: JsonStateStore<DurableGenesisState>;
    constructor(path: string) {
        this.store = new JsonStateStore(path, () => ({ systems: [], blueprints: [], sessions: [], grants: [], audit: [] }));
    }

    systems(): readonly GenesisSystemDefinition[] { return [...this.store.read().systems]; }
    saveSystem(system: GenesisSystemDefinition): void {
        this.store.update(state => ({ ...state, systems: [...state.systems.filter(item => item.systemId !== system.systemId), system] }));
    }

    blueprints(): readonly SystemBlueprint[] { return this.store.read().blueprints.map(value => revive<SystemBlueprint>(value)); }
    saveBlueprint(blueprint: SystemBlueprint): void {
        this.store.update(state => ({ ...state, blueprints: [...state.blueprints.filter(item => (item as SystemBlueprint).blueprintId !== blueprint.blueprintId), blueprint] }));
    }

    sessions(): readonly GenesisBuildSession[] { return this.store.read().sessions.map(value => revive<GenesisBuildSession>(value)); }
    saveSession(session: GenesisBuildSession): void {
        this.store.update(state => ({ ...state, sessions: [...state.sessions.filter(item => (item as GenesisBuildSession).sessionId !== session.sessionId), session] }));
    }

    grants(): readonly AutonomousBuildGrant[] { return this.store.read().grants.map(value => revive<AutonomousBuildGrant>(value)); }
    saveGrant(grant: AutonomousBuildGrant): void {
        this.store.update(state => ({ ...state, grants: [...state.grants.filter(item => (item as AutonomousBuildGrant).grantId !== grant.grantId), grant] }));
    }
    grant(grantId: string): AutonomousBuildGrant | undefined { return this.grants().find(grant => grant.grantId === grantId); }

    appendAudit(event: GenesisAuditEvent): void {
        this.store.update(state => ({ ...state, audit: [...state.audit, event] }));
    }
    audit(): readonly GenesisAuditEvent[] { return [...this.store.read().audit]; }
}
