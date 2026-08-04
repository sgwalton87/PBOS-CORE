import { randomUUID } from "crypto";
import { SystemConnector } from "../contracts/system-connector";
import type { IntegrationStateRepository } from "../state/contracts";

const STATUS_TRANSITIONS: Readonly<Record<SystemConnector["status"], readonly SystemConnector["status"][]>> = {
    REGISTERED: ["ACTIVE", "SUSPENDED", "DISCONNECTED", "FAILED"],
    ACTIVE: ["SUSPENDED", "DISCONNECTED", "FAILED"],
    SUSPENDED: ["ACTIVE", "DISCONNECTED", "FAILED"],
    DISCONNECTED: ["ACTIVE"],
    FAILED: ["SUSPENDED", "DISCONNECTED"]
};

export class ConnectedSystemRegistry {
    private readonly connectors = new Map<string, SystemConnector>();
    constructor(private readonly repository?: IntegrationStateRepository, private readonly organizationId = "PBOS-DEFAULT-ORG") {
        repository?.connectors(organizationId).forEach(connector => this.connectors.set(connector.connectorId, connector));
    }
    register(connector: SystemConnector): void {
        if (this.get(connector.connectorId)) throw new Error(`Connector already registered: ${connector.connectorId}`);
        if (this.values().some(candidate =>
            candidate.externalSystemId === connector.externalSystemId && candidate.version === connector.version)) {
            throw new Error("External system connector version already registered.");
        }
        this.connectors.set(connector.connectorId, connector);
        this.repository?.saveConnector(this.organizationId, connector);
    }
    update(connector: SystemConnector): void {
        const current = this.get(connector.connectorId);
        if (!current) throw new Error(`Connector not found: ${connector.connectorId}`);
        if (current.externalSystemId !== connector.externalSystemId || current.pbosSystemId !== connector.pbosSystemId) {
            throw new Error("Connector system identity is immutable.");
        }
        if (current.status !== connector.status && !STATUS_TRANSITIONS[current.status].includes(connector.status)) {
            throw new Error(`Invalid connector transition: ${current.status} -> ${connector.status}`);
        }
        this.connectors.set(connector.connectorId, connector);
        this.repository?.saveConnector(this.organizationId, connector);
    }
    revoke(connectorId: string, reason: string, revokedBy: string, approvalId: string): SystemConnector {
        const current = this.get(connectorId);
        if (!current) throw new Error(`Connector not found: ${connectorId}`);
        const revoked = { ...current, status: "SUSPENDED" as const, certification: "REVOKED" as const };
        this.repository?.revoke({ revocationId: randomUUID(), organizationId: this.organizationId,
            resourceType: "CONNECTOR", resourceId: connectorId, reason, revokedBy, approvalId, revokedAt: new Date() });
        this.connectors.set(connectorId, revoked);
        this.repository?.saveConnector(this.organizationId, revoked);
        return revoked;
    }
    get(connectorId: string): SystemConnector | undefined { return this.values().find(connector => connector.connectorId === connectorId); }
    forDomain(domainId: string): readonly SystemConnector[] {
        return this.values().filter(connector => connector.domainIds.includes(domainId));
    }
    all(): readonly SystemConnector[] { return this.values(); }
    private values(): SystemConnector[] {
        const connectors = [...(this.repository?.connectors(this.organizationId) ?? this.connectors.values())];
        const revoked = new Set(this.repository?.revocations(this.organizationId)
            .filter(item => item.resourceType === "CONNECTOR").map(item => item.resourceId) ?? []);
        return connectors.map(connector => revoked.has(connector.connectorId)
            ? { ...connector, status: "SUSPENDED" as const, certification: "REVOKED" as const } : connector);
    }
}
