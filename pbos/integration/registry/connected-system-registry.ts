import { SystemConnector } from "../contracts/system-connector";

const STATUS_TRANSITIONS: Readonly<Record<SystemConnector["status"], readonly SystemConnector["status"][]>> = {
    REGISTERED: ["ACTIVE", "SUSPENDED", "DISCONNECTED", "FAILED"],
    ACTIVE: ["SUSPENDED", "DISCONNECTED", "FAILED"],
    SUSPENDED: ["ACTIVE", "DISCONNECTED", "FAILED"],
    DISCONNECTED: ["ACTIVE"],
    FAILED: ["SUSPENDED", "DISCONNECTED"]
};

export class ConnectedSystemRegistry {
    private readonly connectors = new Map<string, SystemConnector>();
    register(connector: SystemConnector): void {
        if (this.connectors.has(connector.connectorId)) throw new Error(`Connector already registered: ${connector.connectorId}`);
        if ([...this.connectors.values()].some(candidate =>
            candidate.externalSystemId === connector.externalSystemId && candidate.version === connector.version)) {
            throw new Error("External system connector version already registered.");
        }
        this.connectors.set(connector.connectorId, connector);
    }
    update(connector: SystemConnector): void {
        const current = this.connectors.get(connector.connectorId);
        if (!current) throw new Error(`Connector not found: ${connector.connectorId}`);
        if (current.externalSystemId !== connector.externalSystemId || current.pbosSystemId !== connector.pbosSystemId) {
            throw new Error("Connector system identity is immutable.");
        }
        if (current.status !== connector.status && !STATUS_TRANSITIONS[current.status].includes(connector.status)) {
            throw new Error(`Invalid connector transition: ${current.status} -> ${connector.status}`);
        }
        this.connectors.set(connector.connectorId, connector);
    }
    get(connectorId: string): SystemConnector | undefined { return this.connectors.get(connectorId); }
    forDomain(domainId: string): readonly SystemConnector[] {
        return [...this.connectors.values()].filter(connector => connector.domainIds.includes(domainId));
    }
    all(): readonly SystemConnector[] { return [...this.connectors.values()]; }
}
