import { randomUUID } from "crypto";
import {
    CapabilityDiscovery,
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
    ConnectorStatusCommand, ConnectorLifecycleCommand, VersionNegotiationCommand, DomainStatusCommand,
    DomainDeactivationCommand, CapabilityDiscoveryCommand, RuntimeOperationCommand, AuditQueryCommand,
    PbosApiFailure,
    PbosApiRequest,
    PbosApiResponse,
    SystemCertificationCommand
} from "../connector-sdk";
import { PbosV1SchemaBoundary, requestHash, RuntimeCommunicationHandler, RuntimeCommunicationType } from "../integration";

export type ConnectorCertificationAuthority = (command: SystemCertificationCommand) => boolean;
export type DomainActivationAuthority = (command: DomainActivationCommand) => boolean;
export type RuntimeAuthorityResolver = (actorId: string, action: string, connectorId: string) => AuthorizationDecision;
export type ConnectorLifecycleAuthority = (command: ConnectorLifecycleCommand | DomainDeactivationCommand) => boolean;

const MUTATIONS = new Set(["REGISTER_SYSTEM", "CERTIFY_SYSTEM", "REGISTER_DOMAIN", "ACTIVATE_DOMAIN", "REGISTER_IDENTITY",
    "SUSPEND_SYSTEM", "RESUME_SYSTEM", "REVOKE_SYSTEM", "DEACTIVATE_DOMAIN", "PUBLISH_LIFECYCLE_EVENT",
    "REQUEST_INTELLIGENCE", "EXCHANGE_APPROVED_DATA"]);

export class PbosV1Api {
    private readonly systems: ConnectedSystemRegistry;
    private readonly domains: DomainRegistrationRegistry;
    private readonly identities: IdentityMapper;
    private readonly runtime: RuntimeCommunicationBoundary;
    private readonly capabilities = new CapabilityDiscovery();

    constructor(
        private readonly certifyConnector: ConnectorCertificationAuthority,
        private readonly activateRegisteredDomain: DomainActivationAuthority,
        private readonly resolveAuthority: RuntimeAuthorityResolver,
        private readonly repository?: IntegrationStateRepository,
        private readonly organizationId = "PBOS-DEFAULT-ORG",
        private readonly lifecycleAuthority: ConnectorLifecycleAuthority = () => false,
        runtimeHandlers: Readonly<Partial<Record<RuntimeCommunicationType, RuntimeCommunicationHandler>>> = {},
        private readonly schemas = new PbosV1SchemaBoundary()
    ) {
        this.systems = new ConnectedSystemRegistry(repository, organizationId);
        this.domains = new DomainRegistrationRegistry(this.systems, repository, organizationId);
        this.identities = new IdentityMapper(repository, organizationId);
        this.runtime = new RuntimeCommunicationBoundary(this.systems, this.domains, {
            ...runtimeHandlers,
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
            const validatedPayload = this.schemas.validateOperation(request.operation, request.payload);
            request = { ...request, payload: validatedPayload };
            const cached = request.idempotencyKey ? this.repository?.idempotency(this.organizationId, request.idempotencyKey) : undefined;
            if (cached) {
                if (cached.operation !== request.operation || cached.requestHash !== requestHash(request.payload)) {
                    throw new Error("Idempotency key reused with a different request.");
                }
                return cached.response as PbosApiResponse;
            }
            const output = await this.dispatch(request);
            const response: PbosApiResponse = {
                success: true,
                apiVersion: "v1",
                correlationId: request.correlationId,
                output,
                provenance: ["PBOS-V1", request.operation, request.correlationId]
            };
            if (request.idempotencyKey && MUTATIONS.has(request.operation) && this.repository) {
                this.repository.claimIdempotency({ organizationId: this.organizationId, key: request.idempotencyKey,
                    operation: request.operation, requestHash: requestHash(request.payload), response, recordedAt: new Date() });
            }
            return response;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const code = /supported PBOS API version/i.test(message) ? "UNSUPPORTED_VERSION"
                : /denied|approval|certif/i.test(message) ? "AUTHORITY_DENIED"
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
            case "GET_CONNECTOR_STATUS": return this.connectorStatus(request.payload as ConnectorStatusCommand);
            case "SUSPEND_SYSTEM": return this.changeConnectorStatus(request.payload as ConnectorLifecycleCommand, "SUSPENDED");
            case "RESUME_SYSTEM": return this.changeConnectorStatus(request.payload as ConnectorLifecycleCommand, "ACTIVE");
            case "REVOKE_SYSTEM": return this.revokeSystem(request.payload as ConnectorLifecycleCommand);
            case "NEGOTIATE_VERSION": return this.negotiateVersion(request.payload as VersionNegotiationCommand);
            case "GET_DOMAIN_STATUS": return this.domainStatus(request.payload as DomainStatusCommand);
            case "DEACTIVATE_DOMAIN": return this.deactivateDomain(request.payload as DomainDeactivationCommand);
            case "DISCOVER_CAPABILITIES": return this.discoverCapabilities(request.payload as CapabilityDiscoveryCommand);
            case "PUBLISH_LIFECYCLE_EVENT": return this.runtimeOperation(request.payload as RuntimeOperationCommand, "LIFECYCLE_EVENT");
            case "REQUEST_INTELLIGENCE": return this.runtimeOperation(request.payload as RuntimeOperationCommand, "INTELLIGENCE_REQUEST");
            case "EXCHANGE_APPROVED_DATA": return this.runtimeOperation(request.payload as RuntimeOperationCommand, "DATA_EXCHANGE");
            case "QUERY_AUDIT": return this.queryAudit(request.payload as AuditQueryCommand);
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

    private connectorStatus(command: ConnectorStatusCommand): SystemConnector {
        this.requireStrings(command, ["connectorId"]);
        const connector = this.systems.get(command.connectorId);
        if (!connector) throw new Error(`Connector not found: ${command.connectorId}`);
        return connector;
    }

    private changeConnectorStatus(command: ConnectorLifecycleCommand, status: "ACTIVE" | "SUSPENDED"): SystemConnector {
        this.requireLifecycle(command);
        const connector = this.connectorStatus(command);
        if (!this.lifecycleAuthority(command)) throw new Error("Connector lifecycle change denied by governance authority.");
        if (status === "ACTIVE" && connector.certification !== "CERTIFIED") throw new Error("Only certified connectors can resume.");
        const updated = { ...connector, status };
        this.systems.update(updated);
        return updated;
    }

    private revokeSystem(command: ConnectorLifecycleCommand): SystemConnector {
        this.requireLifecycle(command);
        this.connectorStatus(command);
        if (!this.lifecycleAuthority(command)) throw new Error("Connector revocation denied by governance authority.");
        return this.systems.revoke(command.connectorId, command.reason, command.actorId, command.approvalId);
    }

    private negotiateVersion(command: VersionNegotiationCommand): Readonly<{ apiVersion: "v1"; connectorVersion: string }> {
        this.requireStrings(command, ["connectorId"]);
        const connector = this.connectorStatus(command);
        if (!command.supportedVersions.includes("v1")) throw new Error("No supported PBOS API version was offered.");
        return { apiVersion: "v1", connectorVersion: connector.version };
    }

    private domainStatus(command: DomainStatusCommand): DomainRegistration {
        this.requireStrings(command, ["registrationId"]);
        const domain = this.domains.get(command.registrationId);
        if (!domain) throw new Error(`Domain registration not found: ${command.registrationId}`);
        return domain;
    }

    private deactivateDomain(command: DomainDeactivationCommand): DomainRegistration {
        this.requireStrings(command, ["registrationId", "approvalId", "actorId", "reason"]);
        const domain = this.domainStatus(command);
        if (!this.lifecycleAuthority(command)) throw new Error("Domain deactivation denied by governance authority.");
        const updated = { ...domain, status: "SUSPENDED" as const, updatedAt: new Date() };
        this.domains.update(updated);
        return updated;
    }

    private discoverCapabilities(command: CapabilityDiscoveryCommand): unknown {
        this.requireStrings(command, ["connectorId"]);
        return this.capabilities.discover(this.connectorStatus(command), command.grantedPermissions);
    }

    private runtimeOperation(command: RuntimeOperationCommand, type: RuntimeCommunicationType): Promise<unknown> {
        this.requireStrings(command, ["connectorId", "domainRegistrationId", "identityMappingId", "purpose", "correlationId"]);
        const mapping = this.identities.get(command.identityMappingId);
        if (!mapping || !mapping.externalIdentity.active || !mapping.pbosIdentity.active) {
            throw new Error(`Identity mapping not found or inactive: ${command.identityMappingId}`);
        }
        const action = type === "LIFECYCLE_EVENT" ? "PUBLISH_LIFECYCLE_EVENT"
            : type === "INTELLIGENCE_REQUEST" ? "USE_INTELLIGENCE" : "EXCHANGE_APPROVED_DATA";
        const authority = this.resolveAuthority(mapping.pbosIdentity.actorId, action, command.connectorId);
        return this.runtime.communicate({ communicationId: randomUUID(), connectorId: command.connectorId,
            domainRegistrationId: command.domainRegistrationId, type, actorId: mapping.pbosIdentity.actorId,
            authority, payload: command.payload, purpose: command.purpose, dataClassification: command.dataClassification,
            exchangeApprovalId: command.exchangeApprovalId, correlationId: command.correlationId,
            provenance: [mapping.mappingId, mapping.externalIdentity.externalIdentityId], requestedAt: new Date() });
    }

    private queryAudit(command: AuditQueryCommand): unknown {
        this.requireStrings(command, ["connectorId"]);
        this.connectorStatus(command);
        const limit = Math.min(Math.max(command.limit ?? 100, 1), 500);
        const events = this.runtime.history(command.connectorId)
            .filter(event => !command.correlationId || event.correlationId === command.correlationId);
        return events.slice(-limit);
    }

    private requireLifecycle(command: ConnectorLifecycleCommand): void {
        this.requireStrings(command, ["connectorId", "approvalId", "actorId", "reason"]);
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
