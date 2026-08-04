import { randomUUID } from "crypto";
import { AuthorityAuditRecord, AuthorityLedger, AutonomousBuildGrant, BuildGrantRegistry } from "../autonomous-authority";
import { GenesisStateRepository } from "./genesis-state-repository";

export class PersistentBuildGrantRegistry extends BuildGrantRegistry {
    constructor(private readonly state: GenesisStateRepository) { super(); }
    override register(grant: AutonomousBuildGrant): void {
        if (this.state.grant(grant.grantId)) throw new Error(`Build grant already registered: ${grant.grantId}`);
        this.state.saveGrant(grant);
    }
    override get(grantId: string): AutonomousBuildGrant | undefined { return this.state.grant(grantId); }
    override update(grant: AutonomousBuildGrant): void {
        if (!this.state.grant(grant.grantId)) throw new Error(`Build grant not found: ${grant.grantId}`);
        this.state.saveGrant(grant);
    }
    override activeForSystem(systemId: string, at = new Date()): readonly AutonomousBuildGrant[] {
        return this.state.grants().filter(grant => grant.systemId === systemId && !grant.revokedAt && grant.expiresAt > at);
    }
}

export class PersistentAuthorityLedger extends AuthorityLedger {
    constructor(private readonly state: GenesisStateRepository) { super(); }
    override record(request: AuthorityAuditRecord["request"], decision: AuthorityAuditRecord["decision"]): void {
        this.state.appendAudit({ eventId: randomUUID(), type: "BUILD_AUTHORITY_DECISION", actorId: decision.grantId,
            resource: request.repository, occurredAt: decision.decidedAt.toISOString(), evidence: { request, decision } });
    }
    override forGrant(grantId: string): readonly AuthorityAuditRecord[] {
        return this.state.audit().filter(event => event.type === "BUILD_AUTHORITY_DECISION" && event.actorId === grantId)
            .map(event => reviveRecord(event.evidence));
    }
}

function reviveRecord(evidence: Readonly<Record<string, unknown>>): AuthorityAuditRecord {
    return JSON.parse(JSON.stringify(evidence), (key, value) =>
        ["requestedAt", "decidedAt"].includes(key) && typeof value === "string" ? new Date(value) : value) as AuthorityAuditRecord;
}
