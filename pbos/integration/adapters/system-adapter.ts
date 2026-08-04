import { IntegrationRequest } from "../contracts/integration-request";
import { SystemConnector } from "../contracts/system-connector";

export interface AdapterResponse<T = unknown> {
    readonly requestId: string;
    readonly correlationId: string;
    readonly output: T;
    readonly provenance: readonly string[];
    readonly respondedAt: Date;
}

export class SystemAdapter<TExternal = unknown, TPbos = unknown> {
    constructor(
        private readonly connector: SystemConnector,
        private readonly toPbos: (input: TExternal) => TPbos,
        private readonly toExternal: (output: TPbos) => TExternal
    ) {}

    translateRequest(request: IntegrationRequest<TExternal>): IntegrationRequest<TPbos> {
        if (request.connectorId !== this.connector.connectorId) {
            throw new Error("Integration request connector identity mismatch.");
        }
        const capability = this.connector.capabilities.find(candidate => candidate.capabilityId === request.capabilityId && candidate.active);
        if (this.connector.status !== "ACTIVE" || this.connector.certification !== "CERTIFIED") {
            throw new Error("Connector is not active and certified.");
        }
        if (!capability) throw new Error("Connector capability is unavailable.");
        if (!request.authority.allowed || request.authority.actorId !== request.actorId ||
            !capability.requiredPermissions.includes(request.authority.action) ||
            !capability.requiredPermissions.every(permission => this.connector.permissions.includes(permission))) {
            throw new Error("Integration request denied by authority or permission boundary.");
        }
        return { ...request, payload: this.toPbos(request.payload), provenance: [...request.provenance, this.connector.connectorId] };
    }

    translateResponse(request: IntegrationRequest<TPbos>, output: TPbos): AdapterResponse<TExternal> {
        return {
            requestId: request.requestId, correlationId: request.correlationId,
            output: this.toExternal(output), provenance: [...request.provenance, request.requestId], respondedAt: new Date()
        };
    }
}
