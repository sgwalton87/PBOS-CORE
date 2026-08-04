import { randomUUID } from "crypto";
import { IntegrationEvent } from "../contracts/integration-event";
import {
    RuntimeCommunicationRequest,
    RuntimeCommunicationResponse,
    RuntimeCommunicationType
} from "../contracts/runtime-communication";
import { ConnectedSystemRegistry } from "../registry/connected-system-registry";
import { DomainRegistrationRegistry } from "../registry/domain-registration-registry";
import type { IntegrationStateRepository } from "../state/contracts";

export type RuntimeCommunicationHandler = (payload: unknown) => Promise<unknown>;

const REQUIRED_ACTIONS: Readonly<Record<RuntimeCommunicationType, string>> = {
    LIFECYCLE_EVENT: "PUBLISH_LIFECYCLE_EVENT",
    HEALTH_CHECK: "READ_RUNTIME_HEALTH",
    INTELLIGENCE_REQUEST: "USE_INTELLIGENCE",
    DATA_EXCHANGE: "EXCHANGE_APPROVED_DATA"
};

export class RuntimeCommunicationBoundary {
    private readonly events: IntegrationEvent[] = [];

    constructor(
        private readonly systems: ConnectedSystemRegistry,
        private readonly domains: DomainRegistrationRegistry,
        private readonly handlers: Readonly<Partial<Record<RuntimeCommunicationType, RuntimeCommunicationHandler>>>,
        private readonly repository?: IntegrationStateRepository,
        private readonly organizationId = "PBOS-DEFAULT-ORG"
    ) {}

    async communicate<T = unknown>(request: RuntimeCommunicationRequest): Promise<RuntimeCommunicationResponse<T>> {
        const connector = this.systems.get(request.connectorId);
        const domain = this.domains.get(request.domainRegistrationId);
        const requiredAction = REQUIRED_ACTIONS[request.type];
        if (!connector || connector.status !== "ACTIVE" || connector.certification !== "CERTIFIED") {
            throw new Error("Runtime communication connector is not active and certified.");
        }
        if (!domain || domain.connectorId !== connector.connectorId || domain.status !== "ACTIVE") {
            throw new Error("Runtime communication domain is not active for this connector.");
        }
        if (!connector.communicationRules.includes(request.type) || !connector.permissions.includes(requiredAction) ||
            !request.authority.allowed || request.authority.actorId !== request.actorId || request.authority.action !== requiredAction) {
            throw new Error("Runtime communication denied by rule, permission, or authority boundary.");
        }
        if (!request.purpose) throw new Error("Runtime communication requires an explicit purpose.");
        if (request.type === "DATA_EXCHANGE" && (!request.exchangeApprovalId || !request.dataClassification)) {
            throw new Error("Data exchange requires approval and classification.");
        }
        const handler = this.handlers[request.type];
        if (!handler) throw new Error(`Runtime communication handler unavailable: ${request.type}`);
        const output = await handler(request.payload) as T;
        const event: IntegrationEvent = {
            eventId: randomUUID(), connectorId: connector.connectorId, type: "RESPONDED",
            correlationId: request.correlationId,
            provenance: [...request.provenance, connector.connectorId, domain.registrationId],
            details: { communicationType: request.type, purpose: request.purpose }, occurredAt: new Date()
        };
        this.events.push(event);
        this.repository?.appendEvent(this.organizationId, event);
        return {
            communicationId: request.communicationId, correlationId: request.correlationId,
            type: request.type, output,
            provenance: [...request.provenance, connector.connectorId, domain.registrationId], respondedAt: new Date()
        };
    }

    history(connectorId: string): readonly IntegrationEvent[] {
        return this.repository?.events(this.organizationId, connectorId) ?? this.events.filter(event => event.connectorId === connectorId);
    }
}
