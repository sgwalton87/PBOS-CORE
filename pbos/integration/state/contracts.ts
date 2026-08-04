import { DomainRegistration } from "../contracts/domain-registration";
import { IntegrationEvent } from "../contracts/integration-event";
import { SystemConnector } from "../contracts/system-connector";
import { IdentityMapping } from "../identity/identity-mapper";

export const INTEGRATION_STATE_SCHEMA_VERSION = 1;

export type IntegrationResourceType = "CONNECTOR" | "DOMAIN" | "IDENTITY";

export interface IntegrationRevocation {
    readonly revocationId: string;
    readonly organizationId: string;
    readonly resourceType: IntegrationResourceType;
    readonly resourceId: string;
    readonly reason: string;
    readonly revokedBy: string;
    readonly approvalId: string;
    readonly revokedAt: Date;
}

export interface IntegrationIdempotencyRecord {
    readonly organizationId: string;
    readonly key: string;
    readonly operation: string;
    readonly requestHash: string;
    readonly response: unknown;
    readonly recordedAt: Date;
}

export interface IntegrationTenantState {
    readonly organizationId: string;
    readonly connectors: readonly SystemConnector[];
    readonly domains: readonly DomainRegistration[];
    readonly identities: readonly IdentityMapping[];
    readonly events: readonly IntegrationEvent[];
    readonly revocations: readonly IntegrationRevocation[];
    readonly idempotency: readonly IntegrationIdempotencyRecord[];
}

export interface DurableIntegrationState {
    readonly schemaVersion: number;
    readonly revision: number;
    readonly tenants: readonly IntegrationTenantState[];
}

export interface IntegrationStateRepository {
    revision(): number;
    connectors(organizationId: string): readonly SystemConnector[];
    saveConnector(organizationId: string, connector: SystemConnector, expectedRevision?: number): void;
    domains(organizationId: string): readonly DomainRegistration[];
    saveDomain(organizationId: string, domain: DomainRegistration, expectedRevision?: number): void;
    identities(organizationId: string): readonly IdentityMapping[];
    saveIdentity(organizationId: string, identity: IdentityMapping, expectedRevision?: number): void;
    events(organizationId: string, connectorId?: string): readonly IntegrationEvent[];
    appendEvent(organizationId: string, event: IntegrationEvent, expectedRevision?: number): void;
    revocations(organizationId: string): readonly IntegrationRevocation[];
    revoke(revocation: IntegrationRevocation, expectedRevision?: number): void;
    idempotency(organizationId: string, key: string): IntegrationIdempotencyRecord | undefined;
    claimIdempotency(record: IntegrationIdempotencyRecord, expectedRevision?: number): void;
    snapshot(): DurableIntegrationState;
}

export type IntegrationStateMigration = (state: DurableIntegrationState) => DurableIntegrationState;
