import { randomUUID } from "crypto";
import {
    DomainRegistration,
    DomainRegistrationRegistry,
    IdentityMapper,
    IdentityMapping,
    ConnectedSystemRegistry,
    RuntimeCommunicationBoundary,
    RuntimeCommunicationRequest,
    SystemConnector,
    IntegrationStateRepository
} from "../integration";
import { AuthorizationDecision } from "../kernel";
import {
    ConnectorRegistrationManifest,
    DomainActivationCommand,
    DomainRegistrationManifest,
    HealthCheckCommand,
    PbosApiFailure,
    PbosApiRequest,
    PbosApiResponse,
    SystemCertificationCommand
} from "../connector-sdk";

export type ConnectorCertificationAuthority = (command: SystemCertificationCommand) => boolean;
export type DomainActivationAuthority = (command: DomainActivationCommand) => boolean;
export type RuntimeAuthorityResolver = (actorId: string, action: string, connectorId: string) => AuthorizationDecision;

export class PbosV1Api {
    private readonly systems: ConnectedSystemRegistry;
    private readonly domains: DomainRegistrationRegistry;
    private readonly identities: IdentityMapper;
    private readonly runtime: RuntimeCommunicationBoundary;

    constructor(
        private readonly certifyConnector: ConnectorCertificationAuthority,
        private readonly activateRegisteredDomain: DomainActivationAuthority,
        private readonly resolveAuthority: RuntimeAuthorityResolver,
        repository?: IntegrationStateRepository,
        organizationId = "PBOS-DEFAULT-ORG"
    ) {
        this.systems = new ConnectedSystemRegistry(repository, organizationId);
        this.domains = new DomainRegistrationRegistry(this.systems, repository, organizationId);
        this.identities = new IdentityMapper(repository, organizationId);
        this.runtime = new RuntimeCommunicationBoundary(this.systems, this.domains, {
            HEALTH_CHECK: async (_payload) => {
                const connectorId = String((_payload as { connectorId?: unknown }).connectorId ?? "");
                const connector = this.systems.get(connectorId);
                if (!connector) throw new Error(`Connector not found: ${connectorId}`);
                return {
                    healthy: true,
                    connectorId,
                    pbosSystemId: connector.pbosSystemId,
                    checkedAt: new Date()
                };
            }
        }, repository, organizationId);
    }

    async handle(request: PbosApiRequest): Promise<PbosApiResponse> {
        if (request.apiVersion !== "v1" || !request.correlationId) {
            return this.failure(request.correlationId, "INVALID_REQUEST", "PBOS API v1 and correlation ID are required.");
        }
        try {
            const output = await this.dispatch(request);
            return {
                success: true,
                apiVersion: "v1",
                correlationId: request.correlationId,
                output,
                provenance: ["PBOS-V1", request.operation, request.correlationId]
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const code = /denied|approval|certif/i.test(message) ? "AUTHORITY_DENIED"
                : /not found/i.test(message) ? "NOT_FOUND"
                : /already|transition/i.test(message) ? "CONFLICT" : "INVALID_REQUEST";
            return this.failure(request.correlationId, code, message);
        }
    }

    private async dispatch(request: PbosApiRequest): Promise<unknown> {
        switch (request.operation) {
            case "REGISTER_SYSTEM": return this.registerSystem(request.payload as ConnectorRegistrationManifest);
            case "CERTIFY_SYSTEM": return this.certifySystem(request.payload as SystemCertificationCommand);
            case "REGISTER_DOMAIN": return this.registerDomain(request.payload as DomainRegistrationManifest);
            case "ACTIVATE_DOMAIN": return this.activateDomain(request.payload as DomainActivationCommand);
            case "REGISTER_IDENTITY": return this.registerIdentity(request.payload as IdentityMapping);
            case "HEALTH_CHECK": {
                const command = request.payload as HealthCheckCommand;
                if (command.correlationId !== request.correlationId) {
                    throw new Error("Health request correlation ID mismatch.");
                }
                return this.healthCheck(command);
            }
        }
    }

    private registerSystem(manifest: ConnectorRegistrationManifest): SystemConnector {
        this.requireStrings(manifest, ["connectorId", "externalSystemId", "pbosSystemId", "name", "version"]);
        if (manifest.domainIds.length === 0 || manifest.capabilities.length === 0) {
            throw new Error("Connector registration requires domains and capabilities.");
        }
        const connector: SystemConnector = {
            ...manifest,
            status: "REGISTERED",
            certification: "PENDING",
            registeredAt: new Date()
        };
        this.systems.register(connector);
        return connector;
    }

    private certifySystem(command: SystemCertificationCommand): SystemConnector {
        this.requireStrings(command, ["connectorId", "approvalId", "certifiedBy"]);
        const connector = this.systems.get(command.connectorId);
        if (!connector) throw new Error(`Connector not found: ${command.connectorId}`);
        if (!command.approvalId || !command.certifiedBy || !this.certifyConnector(command)) {
            throw new Error("Connector certification denied by governance authority.");
        }
        const certified = { ...connector, status: "ACTIVE" as const, certification: "CERTIFIED" as const };
        this.systems.update(certified);
        return certified;
    }

    private registerDomain(manifest: DomainRegistrationManifest): DomainRegistration {
        this.requireStrings(manifest, ["registrationId", "connectorId", "externalSystemId", "pbosSystemId", "domainId"]);
        if (manifest.capabilityIds.length === 0 || manifest.governanceRequirementIds.length === 0) {
            throw new Error("Domain registration requires capabilities and governance requirements.");
        }
        const registration: DomainRegistration = {
            ...manifest,
            status: "REGISTERED",
            registeredAt: new Date(),
            updatedAt: new Date()
        };
        this.domains.register(registration);
        return registration;
    }

    private activateDomain(command: DomainActivationCommand): DomainRegistration {
        this.requireStrings(command, ["registrationId", "approvalId"]);
        const registration = this.domains.get(command.registrationId);
        if (!registration) throw new Error(`Domain registration not found: ${command.registrationId}`);
        const connector = this.systems.get(registration.connectorId);
        if (!connector || connector.status !== "ACTIVE" || connector.certification !== "CERTIFIED") {
            throw new Error("Domain activation requires an active certified connector.");
        }
        if (!command.approvalId || !this.activateRegisteredDomain(command)) {
            throw new Error("Domain activation denied by governance authority.");
        }
        const active = { ...registration, status: "ACTIVE" as const, updatedAt: new Date() };
        this.domains.update(active);
        return active;
    }

    private registerIdentity(mapping: IdentityMapping): IdentityMapping {
        this.requireStrings(mapping, ["mappingId"]);
        const connector = this.systems.all().find(candidate =>
            candidate.externalSystemId === mapping.externalIdentity.externalSystemId &&
            candidate.pbosSystemId === mapping.pbosIdentity.systemId
        );
        if (!connector || connector.status !== "ACTIVE" || connector.certification !== "CERTIFIED") {
            throw new Error("Identity registration requires an active certified connector.");
        }
        this.identities.map(mapping);
        return mapping;
    }

    private healthCheck(command: HealthCheckCommand): Promise<unknown> {
        this.requireStrings(command, ["connectorId", "domainRegistrationId", "identityMappingId", "purpose", "correlationId"]);
        const mapping = this.identities.get(command.identityMappingId);
        if (!mapping) throw new Error(`Identity mapping not found: ${command.identityMappingId}`);
        const authority = this.resolveAuthority(mapping.pbosIdentity.actorId, "READ_RUNTIME_HEALTH", command.connectorId);
        const request: RuntimeCommunicationRequest = {
            communicationId: randomUUID(),
            connectorId: command.connectorId,
            domainRegistrationId: command.domainRegistrationId,
            type: "HEALTH_CHECK",
            actorId: mapping.pbosIdentity.actorId,
            authority,
            payload: { connectorId: command.connectorId },
            purpose: command.purpose,
            correlationId: command.correlationId,
            provenance: [mapping.mappingId, mapping.externalIdentity.externalIdentityId],
            requestedAt: new Date()
        };
        return this.runtime.communicate(request);
    }

    private failure(correlationId: string, code: PbosApiFailure["error"]["code"], message: string): PbosApiFailure {
        return { success: false, apiVersion: "v1", correlationId, error: { code, message } };
    }

    private requireStrings(value: object, fields: readonly string[]): void {
        const record = value as Readonly<Record<string, unknown>>;
        const missing = fields.filter(field => typeof record[field] !== "string" || !String(record[field]).trim());
        if (missing.length > 0) throw new Error(`Required PBOS fields missing: ${missing.join(", ")}`);
    }
}
