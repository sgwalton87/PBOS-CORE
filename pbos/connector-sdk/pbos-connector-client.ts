import { IdentityMapping } from "../integration";
import {
    ConnectorRegistrationManifest,
    DomainActivationCommand,
    DomainRegistrationManifest,
    HealthCheckCommand,
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

    private send<TOutput>(operation: PbosApiOperation, payload: unknown, correlationId: string): Promise<PbosApiResponse<TOutput>> {
        if (!correlationId) throw new Error("PBOS connector requests require a correlation ID.");
        return this.transport.send<TOutput>({ apiVersion: "v1", operation, correlationId, payload });
    }
}
