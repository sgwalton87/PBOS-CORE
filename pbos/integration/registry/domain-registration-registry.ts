import { DomainRegistration } from "../contracts/domain-registration";
import { ConnectedSystemRegistry } from "./connected-system-registry";

const STATUS_TRANSITIONS: Readonly<Record<DomainRegistration["status"], readonly DomainRegistration["status"][]>> = {
    REGISTERED: ["ACTIVE", "SUSPENDED", "REVOKED"],
    ACTIVE: ["SUSPENDED", "REVOKED"],
    SUSPENDED: ["ACTIVE", "REVOKED"],
    REVOKED: []
};

export class DomainRegistrationRegistry {
    private readonly registrations = new Map<string, DomainRegistration>();

    constructor(private readonly systems: ConnectedSystemRegistry) {}

    register(registration: DomainRegistration): void {
        if (this.registrations.has(registration.registrationId)) {
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
    }

    update(registration: DomainRegistration): void {
        const current = this.registrations.get(registration.registrationId);
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
    }

    get(registrationId: string): DomainRegistration | undefined { return this.registrations.get(registrationId); }
    forConnector(connectorId: string): readonly DomainRegistration[] {
        return [...this.registrations.values()].filter(registration => registration.connectorId === connectorId);
    }
}
