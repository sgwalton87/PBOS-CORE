import { IdentityMapping } from "../integration";
import {
    ConnectorRegistrationManifest,
    DomainActivationCommand,
    DomainRegistrationManifest,
    HealthCheckCommand,
    ConnectorStatusCommand, ConnectorLifecycleCommand, VersionNegotiationCommand, DomainStatusCommand,
    DomainDeactivationCommand, CapabilityDiscoveryCommand, RuntimeOperationCommand, AuditQueryCommand,
    PbosApiOperation,
    PbosApiRequest,
    PbosApiResponse,
    SystemCertificationCommand
} from "./contracts";

export interface PbosConnectorTransport {
    send<TOutput>(request: PbosApiRequest): Promise<PbosApiResponse<TOutput>>;
}

export class PbosConnectorClient {
    constructor(private readonly transport: PbosConnectorTransport) {}

    registerSystem<TOutput>(manifest: ConnectorRegistrationManifest, correlationId: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("REGISTER_SYSTEM", manifest, correlationId);
    }

    certifySystem<TOutput>(command: SystemCertificationCommand, correlationId: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("CERTIFY_SYSTEM", command, correlationId);
    }

    registerDomain<TOutput>(manifest: DomainRegistrationManifest, correlationId: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("REGISTER_DOMAIN", manifest, correlationId);
    }

    activateDomain<TOutput>(command: DomainActivationCommand, correlationId: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("ACTIVATE_DOMAIN", command, correlationId);
    }

    registerIdentity<TOutput>(mapping: IdentityMapping, correlationId: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("REGISTER_IDENTITY", mapping, correlationId);
    }

    healthCheck<TOutput>(command: HealthCheckCommand): Promise<PbosApiResponse<TOutput>> {
        return this.send("HEALTH_CHECK", command, command.correlationId);
    }

    connectorStatus<TOutput>(command: ConnectorStatusCommand, correlationId: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("GET_CONNECTOR_STATUS", command, correlationId);
    }
    suspendSystem<TOutput>(command: ConnectorLifecycleCommand, correlationId: string, idempotencyKey: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("SUSPEND_SYSTEM", command, correlationId, idempotencyKey);
    }
    resumeSystem<TOutput>(command: ConnectorLifecycleCommand, correlationId: string, idempotencyKey: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("RESUME_SYSTEM", command, correlationId, idempotencyKey);
    }
    revokeSystem<TOutput>(command: ConnectorLifecycleCommand, correlationId: string, idempotencyKey: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("REVOKE_SYSTEM", command, correlationId, idempotencyKey);
    }
    negotiateVersion<TOutput>(command: VersionNegotiationCommand, correlationId: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("NEGOTIATE_VERSION", command, correlationId);
    }
    domainStatus<TOutput>(command: DomainStatusCommand, correlationId: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("GET_DOMAIN_STATUS", command, correlationId);
    }
    deactivateDomain<TOutput>(command: DomainDeactivationCommand, correlationId: string, idempotencyKey: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("DEACTIVATE_DOMAIN", command, correlationId, idempotencyKey);
    }
    discoverCapabilities<TOutput>(command: CapabilityDiscoveryCommand, correlationId: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("DISCOVER_CAPABILITIES", command, correlationId);
    }
    publishLifecycleEvent<TOutput>(command: RuntimeOperationCommand, idempotencyKey?: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("PUBLISH_LIFECYCLE_EVENT", command, command.correlationId, idempotencyKey);
    }
    requestIntelligence<TOutput>(command: RuntimeOperationCommand, idempotencyKey?: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("REQUEST_INTELLIGENCE", command, command.correlationId, idempotencyKey);
    }
    exchangeApprovedData<TOutput>(command: RuntimeOperationCommand, idempotencyKey?: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("EXCHANGE_APPROVED_DATA", command, command.correlationId, idempotencyKey);
    }
    queryAudit<TOutput>(command: AuditQueryCommand, correlationId: string): Promise<PbosApiResponse<TOutput>> {
        return this.send("QUERY_AUDIT", command, correlationId);
    }

    private send<TOutput>(operation: PbosApiOperation, payload: unknown, correlationId: string,
        idempotencyKey?: string): Promise<PbosApiResponse<TOutput>> {
        if (!correlationId) throw new Error("PBOS connector requests require a correlation ID.");
        return this.transport.send<TOutput>({ apiVersion: "v1", operation, correlationId, payload, idempotencyKey });
    }
}
