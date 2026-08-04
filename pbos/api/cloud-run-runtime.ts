import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
    ConnectorCredential,
    ConnectorHmacAuthenticator,
    ConnectorRateLimiter,
    FileIntegrationStateRepository,
    InMemoryConnectorCredentialRegistry,
    InMemoryConnectorSecretProvider,
    RepositoryReplayNonceStore
} from "../integration";
import { AuthorizationDecision } from "../kernel";
import { PbosIntegrationService } from "./integration-service";
import { PbosNodeHttpAdapter } from "./node-http-adapter";
import { PbosV1Api } from "./pbos-v1-api";

interface TrustCredential extends Omit<ConnectorCredential, "issuedAt" | "expiresAt"> {
    readonly issuedAt: string;
    readonly expiresAt: string;
    readonly secretBase64: string;
}

interface CloudRunTrustBundle {
    readonly credentials: readonly TrustCredential[];
    readonly certificationApprovalIds?: readonly string[];
    readonly domainApprovalIds?: readonly string[];
    readonly lifecycleApprovalIds?: readonly string[];
    readonly allowedRuntimeActions?: readonly string[];
}

export interface CloudRunRuntimeConfig {
    readonly organizationId: string;
    readonly port: number;
    readonly host: string;
    readonly statePath: string;
    readonly allowedOrigins: readonly string[];
    readonly trustBundle: CloudRunTrustBundle;
}

const required = (environment: NodeJS.ProcessEnv, name: string): string => {
    const value = environment[name]?.trim();
    if (!value) throw new Error(`Required Cloud Run configuration is missing: ${name}`);
    return value;
};

const stringList = (value?: string): readonly string[] =>
    value?.split(",").map(item => item.trim()).filter(Boolean) ?? [];

export function cloudRunRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): CloudRunRuntimeConfig {
    const port = Number(environment.PORT ?? "8080");
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a valid TCP port.");
    let trustBundle: CloudRunTrustBundle;
    try {
        trustBundle = JSON.parse(required(environment, "PBOS_CONNECTOR_TRUST_BUNDLE")) as CloudRunTrustBundle;
    } catch (error) {
        if (error instanceof SyntaxError) throw new Error("PBOS_CONNECTOR_TRUST_BUNDLE must be valid JSON.");
        throw error;
    }
    if (!Array.isArray(trustBundle.credentials) || trustBundle.credentials.length === 0) {
        throw new Error("PBOS_CONNECTOR_TRUST_BUNDLE must contain at least one credential.");
    }
    return {
        organizationId: required(environment, "PBOS_ORGANIZATION_ID"),
        port,
        host: environment.HOST?.trim() || "0.0.0.0",
        statePath: required(environment, "PBOS_INTEGRATION_STATE_PATH"),
        allowedOrigins: stringList(environment.PBOS_ALLOWED_ORIGINS),
        trustBundle
    };
}

export function createCloudRunIntegrationService(config: CloudRunRuntimeConfig): PbosIntegrationService {
    mkdirSync(dirname(config.statePath), { recursive: true });
    const repository = new FileIntegrationStateRepository(config.statePath);
    const credentials = new InMemoryConnectorCredentialRegistry();
    const secrets = new InMemoryConnectorSecretProvider();
    for (const source of config.trustBundle.credentials) {
        if (!source.keyId || !source.connectorId || !source.organizationId || !source.secretBase64) {
            throw new Error("Every connector trust credential requires organizationId, connectorId, keyId, and secretBase64.");
        }
        if (source.organizationId !== config.organizationId) {
            throw new Error(`Connector credential organization mismatch: ${source.keyId}`);
        }
        const { secretBase64, ...credential } = source;
        const secret = Buffer.from(secretBase64, "base64");
        if (secret.length < 32) throw new Error(`Connector secret is too short: ${source.keyId}`);
        const issuedAt = new Date(source.issuedAt);
        const expiresAt = new Date(source.expiresAt);
        if (!Number.isFinite(issuedAt.getTime()) || !Number.isFinite(expiresAt.getTime())) {
            throw new Error(`Connector credential dates are invalid: ${source.keyId}`);
        }
        credentials.save({ ...credential, issuedAt, expiresAt });
        secrets.store(source.keyId, secret);
    }
    const certificationApprovals = new Set(config.trustBundle.certificationApprovalIds ?? []);
    const domainApprovals = new Set(config.trustBundle.domainApprovalIds ?? []);
    const lifecycleApprovals = new Set(config.trustBundle.lifecycleApprovalIds ?? []);
    const runtimeActions = new Set(config.trustBundle.allowedRuntimeActions ?? []);
    const api = new PbosV1Api(
        command => certificationApprovals.has(command.approvalId),
        command => domainApprovals.has(command.approvalId),
        (actorId, action): AuthorizationDecision => ({
            allowed: runtimeActions.has(action), actorId, action,
            authorityId: "PBOS-CLOUD-RUN-GOVERNANCE",
            reason: runtimeActions.has(action) ? "Action permitted by the deployed PBOS governance bundle."
                : "Action denied by the deployed PBOS governance bundle."
        }),
        repository,
        config.organizationId,
        command => lifecycleApprovals.has(command.approvalId),
        {
            LIFECYCLE_EVENT: async payload => ({ accepted: true, payload }),
            DATA_EXCHANGE: async payload => ({ accepted: true, payload })
        }
    );
    const authenticator = new ConnectorHmacAuthenticator(credentials, secrets,
        new RepositoryReplayNonceStore(repository));
    return new PbosIntegrationService(new PbosNodeHttpAdapter(api, "/pbos/v1", authenticator,
        new ConnectorRateLimiter(120, 60_000), 1_048_576, config.allowedOrigins));
}

export async function startCloudRunIntegrationService(
    environment: NodeJS.ProcessEnv = process.env
): Promise<PbosIntegrationService> {
    const config = cloudRunRuntimeConfig(environment);
    const service = createCloudRunIntegrationService(config);
    await service.start(config.port, config.host);
    return service;
}
