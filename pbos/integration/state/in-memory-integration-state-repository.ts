import { DomainRegistration } from "../contracts/domain-registration";
import { IntegrationEvent } from "../contracts/integration-event";
import { SystemConnector } from "../contracts/system-connector";
import { IdentityMapping } from "../identity/identity-mapper";
import {
    DurableIntegrationState, IntegrationIdempotencyRecord, IntegrationRevocation, IntegrationStateRepository,
    IntegrationTenantState
} from "./contracts";
import {
    assertExpectedRevision, assertOrganizationId, emptyIntegrationState, emptyTenant, validateIdempotency, validateRevocation
} from "./integration-state-core";

export class InMemoryIntegrationStateRepository implements IntegrationStateRepository {
    protected state: DurableIntegrationState;
    constructor(initial: DurableIntegrationState = emptyIntegrationState()) { this.state = initial; }
    revision(): number { return this.state.revision; }
    connectors(organizationId: string): readonly SystemConnector[] { return [...this.tenant(organizationId).connectors]; }
    saveConnector(organizationId: string, connector: SystemConnector, expectedRevision?: number): void {
        this.change(organizationId, expectedRevision, tenant => {
            const conflict = tenant.connectors.find(item => item.connectorId !== connector.connectorId &&
                item.externalSystemId === connector.externalSystemId && item.version === connector.version);
            if (conflict) throw new Error("External system connector version already registered for organization.");
            return { ...tenant, connectors: [...tenant.connectors.filter(item => item.connectorId !== connector.connectorId), connector] };
        });
    }
    domains(organizationId: string): readonly DomainRegistration[] { return [...this.tenant(organizationId).domains]; }
    saveDomain(organizationId: string, domain: DomainRegistration, expectedRevision?: number): void {
        this.change(organizationId, expectedRevision, tenant => ({ ...tenant,
            domains: [...tenant.domains.filter(item => item.registrationId !== domain.registrationId), domain] }));
    }
    identities(organizationId: string): readonly IdentityMapping[] { return [...this.tenant(organizationId).identities]; }
    saveIdentity(organizationId: string, identity: IdentityMapping, expectedRevision?: number): void {
        this.change(organizationId, expectedRevision, tenant => ({ ...tenant,
            identities: [...tenant.identities.filter(item => item.mappingId !== identity.mappingId), identity] }));
    }
    events(organizationId: string, connectorId?: string): readonly IntegrationEvent[] {
        const events = this.tenant(organizationId).events;
        return [...(connectorId ? events.filter(event => event.connectorId === connectorId) : events)];
    }
    appendEvent(organizationId: string, event: IntegrationEvent, expectedRevision?: number): void {
        this.change(organizationId, expectedRevision, tenant => {
            if (tenant.events.some(item => item.eventId === event.eventId)) throw new Error(`Integration event already recorded: ${event.eventId}`);
            return { ...tenant, events: [...tenant.events, event] };
        });
    }
    revocations(organizationId: string): readonly IntegrationRevocation[] { return [...this.tenant(organizationId).revocations]; }
    revoke(revocation: IntegrationRevocation, expectedRevision?: number): void {
        validateRevocation(revocation);
        this.change(revocation.organizationId, expectedRevision, tenant => {
            if (tenant.revocations.some(item => item.resourceType === revocation.resourceType && item.resourceId === revocation.resourceId)) {
                throw new Error(`Integration resource already revoked: ${revocation.resourceType}:${revocation.resourceId}`);
            }
            return { ...tenant, revocations: [...tenant.revocations, revocation] };
        });
    }
    idempotency(organizationId: string, key: string): IntegrationIdempotencyRecord | undefined {
        return this.tenant(organizationId).idempotency.find(record => record.key === key);
    }
    claimIdempotency(record: IntegrationIdempotencyRecord, expectedRevision?: number): void {
        validateIdempotency(record);
        this.change(record.organizationId, expectedRevision, tenant => {
            const existing = tenant.idempotency.find(item => item.key === record.key);
            if (existing && (existing.operation !== record.operation || existing.requestHash !== record.requestHash)) {
                throw new Error(`Idempotency key reused with a different request: ${record.key}`);
            }
            return existing ? tenant : { ...tenant, idempotency: [...tenant.idempotency, record] };
        });
    }
    snapshot(): DurableIntegrationState { return structuredClone(this.state); }

    protected tenant(organizationId: string): IntegrationTenantState {
        assertOrganizationId(organizationId);
        return this.state.tenants.find(tenant => tenant.organizationId === organizationId) ?? emptyTenant(organizationId);
    }
    protected change(organizationId: string, expectedRevision: number | undefined,
        update: (tenant: IntegrationTenantState) => IntegrationTenantState): void {
        assertOrganizationId(organizationId);
        assertExpectedRevision(this.state, expectedRevision);
        const current = this.tenant(organizationId);
        const updated = update(current);
        this.state = { ...this.state, revision: this.state.revision + 1,
            tenants: [...this.state.tenants.filter(tenant => tenant.organizationId !== organizationId), updated] };
    }
}
