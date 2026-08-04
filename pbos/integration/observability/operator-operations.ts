import { DeliveryRepository, ReliableDeliveryEngine } from "../reliability";
import { ConnectedSystemRegistry } from "../registry/connected-system-registry";
import { IntegrationStateRepository } from "../state";

export class IntegrationOperatorOperations {
    constructor(private readonly organizationId: string, private readonly systems: ConnectedSystemRegistry,
        private readonly state: IntegrationStateRepository, private readonly deliveries: DeliveryRepository,
        private readonly deliveryEngine: ReliableDeliveryEngine) {}
    status(connectorId: string): unknown {
        return { connector: this.systems.get(connectorId), events: this.state.events(this.organizationId, connectorId).length,
            pending: this.deliveries.pending(this.organizationId).filter(item => item.connectorId === connectorId).length,
            deadLetters: this.deliveries.deadLetters(this.organizationId).filter(item => item.connectorId === connectorId).length };
    }
    revoke(connectorId: string, reason: string, actorId: string, approvalId: string): unknown {
        return this.systems.revoke(connectorId, reason, actorId, approvalId);
    }
    replay(deliveryId: string, approvalId: string, actorId: string, authority: Parameters<ReliableDeliveryEngine["replay"]>[3]): unknown {
        return this.deliveryEngine.replay(deliveryId, approvalId, actorId, authority);
    }
    audit(connectorId: string): unknown { return this.state.events(this.organizationId, connectorId); }
    incident(connectorId: string, reason: string): unknown { return { connectorId, reason, declaredAt: new Date(), status: "OPEN" }; }
}
