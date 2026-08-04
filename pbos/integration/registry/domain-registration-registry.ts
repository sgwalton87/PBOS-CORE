import { randomUUID } from "crypto";
import { DomainRegistration } from "../contracts/domain-registration";
import { ConnectedSystemRegistry } from "./connected-system-registry";
import type { IntegrationStateRepository } from "../state/contracts";

const STATUS_TRANSITIONS: Readonly<Record<DomainRegistration["status"], readonly DomainRegistration["status"][]>> = {
    REGISTERED: ["ACTIVE", "SUSPENDED", "REVOKED"],
    ACTIVE: ["SUSPENDED", "REVOKED"],
    SUSPENDED: ["ACTIVE", "REVOKED"],
    REVOKED: []
};

export class DomainRegistrationRegistry {
    private readonly registrations = new Map<string, DomainRegistration>();

    constructor(private readonly systems: ConnectedSystemRegistry, private readonly repository?: IntegrationStateRepository,
        private readonly organizationId = "PBOS-DEFAULT-ORG") {
        repository?.domains(organizationId).forEach(registration => this.registrations.set(registration.registrationId, registration));
    }

    register(registration: DomainRegistration): void {
        if (this.get(registration.registrationId)) {
            throw new Error(`Domain registration already exists: ${registration.registrationId}`);
        }
        const connector = this.systems.get(registration.connectorId);
        if (!connector || connector.externalSystemId !== registration.externalSystemId ||
            connector.pbosSystemId !== registration.pbosSystemId || !connector.domainIds.includes(registration.domainId)) {
            throw new Error("Domain registration does not match its connected system.");
        }
        const declaredCapabilities = new Set(connector.capabilities.map(capability => capability.capabilityId));
        if (registration.capabilityIds.some(capabilityId => !declaredCapabilities.has(capabilityId))) {
            throw new Error("Domain registration declares an unknown connector capability.");
        }
        this.registrations.set(registration.registrationId, registration);
        this.repository?.saveDomain(this.organizationId, registration);
    }

    revoke(registrationId: string, reason: string, revokedBy: string, approvalId: string): DomainRegistration {
        const current = this.get(registrationId);
        if (!current) throw new Error(`Domain registration not found: ${registrationId}`);
        const revoked = { ...current, status: "REVOKED" as const, updatedAt: new Date() };
        this.repository?.revoke({ revocationId: randomUUID(), organizationId: this.organizationId,
            resourceType: "DOMAIN", resourceId: registrationId, reason, revokedBy, approvalId, revokedAt: new Date() });
        this.registrations.set(registrationId, revoked);
        this.repository?.saveDomain(this.organizationId, revoked);
        return revoked;
    }

    update(registration: DomainRegistration): void {
        const current = this.get(registration.registrationId);
        if (!current) {
            throw new Error(`Domain registration not found: ${registration.registrationId}`);
        }
        if (current.connectorId !== registration.connectorId || current.externalSystemId !== registration.externalSystemId ||
            current.pbosSystemId !== registration.pbosSystemId || current.domainId !== registration.domainId) {
            throw new Error("Domain registration identity is immutable.");
        }
        if (current.status !== registration.status && !STATUS_TRANSITIONS[current.status].includes(registration.status)) {
            throw new Error(`Invalid domain registration transition: ${current.status} -> ${registration.status}`);
        }
        this.registrations.set(registration.registrationId, registration);
        this.repository?.saveDomain(this.organizationId, registration);
    }

    get(registrationId: string): DomainRegistration | undefined { return this.values().find(item => item.registrationId === registrationId); }
    forConnector(connectorId: string): readonly DomainRegistration[] {
        return this.values().filter(registration => registration.connectorId === connectorId);
    }
    private values(): DomainRegistration[] {
        const domains = [...(this.repository?.domains(this.organizationId) ?? this.registrations.values())];
        const revoked = new Set(this.repository?.revocations(this.organizationId)
            .filter(item => item.resourceType === "DOMAIN").map(item => item.resourceId) ?? []);
        return domains.map(domain => revoked.has(domain.registrationId) ? { ...domain, status: "REVOKED" as const } : domain);
    }
}
