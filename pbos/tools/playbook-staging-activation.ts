import { readFileSync } from "node:fs";
import { PbosConnectorClient, PbosHttpTransport, PbosApiResponse } from "../connector-sdk";
import {
    PLAYBOOK_CONNECTOR_MANIFEST,
    PLAYBOOK_DOMAIN_MANIFEST,
    playbookSupabaseIdentity
} from "../reference-systems";

interface PlaybookBootstrap {
    readonly organizationId: string;
    readonly connectorId: string;
    readonly keyId: string;
    readonly secretBase64: string;
    readonly expiresAt: string;
    readonly certificationApprovalId: string;
    readonly domainApprovalId: string;
}

export interface PlaybookStagingActivationConfig {
    readonly endpoint: string;
    readonly bootstrap: PlaybookBootstrap;
    readonly supabaseUserId: string;
    readonly exchangeApprovalId: string;
}

const required = (environment: NodeJS.ProcessEnv, name: string): string => {
    const value = environment[name]?.trim();
    if (!value) throw new Error(`Required Playbook activation configuration is missing: ${name}`);
    return value;
};

export function playbookStagingActivationConfig(
    environment: NodeJS.ProcessEnv = process.env
): PlaybookStagingActivationConfig {
    const endpoint = required(environment, "PBOS_STAGING_ENDPOINT");
    const bootstrapPath = required(environment, "PBOS_PLAYBOOK_BOOTSTRAP_PATH");
    const bootstrap = JSON.parse(readFileSync(bootstrapPath, "utf8")) as PlaybookBootstrap;
    if (bootstrap.organizationId !== "PLAYBOOK-ORG-001" || bootstrap.connectorId !== PLAYBOOK_CONNECTOR_MANIFEST.connectorId) {
        throw new Error("Playbook bootstrap ownership does not match the certified connector manifest.");
    }
    const secret = Buffer.from(bootstrap.secretBase64, "base64");
    if (!bootstrap.keyId || secret.length < 32 || new Date(bootstrap.expiresAt).getTime() <= Date.now()) {
        throw new Error("Playbook bootstrap credential is invalid or expired.");
    }
    return {
        endpoint: new URL("/pbos/v1", endpoint).toString(),
        bootstrap,
        supabaseUserId: required(environment, "PBOS_PLAYBOOK_SUPABASE_USER_ID"),
        exchangeApprovalId: required(environment, "PBOS_PLAYBOOK_EXCHANGE_APPROVAL_ID")
    };
}

const requireSuccess = <T>(operation: string, response: PbosApiResponse<T>): T => {
    if (!response.success) throw new Error(`${operation} failed: ${response.error.code} ${response.error.message}`);
    return response.output;
};

export async function activatePlaybookStaging(config: PlaybookStagingActivationConfig): Promise<unknown> {
    const transport = new PbosHttpTransport(config.endpoint,
        async (input, init) => fetch(input, init), {
            organizationId: config.bootstrap.organizationId,
            connectorId: config.bootstrap.connectorId,
            keyId: config.bootstrap.keyId,
            secret: Buffer.from(config.bootstrap.secretBase64, "base64")
        });
    const client = new PbosConnectorClient(transport);
    const runId = new Date().toISOString().replace(/[^0-9]/g, "");
    const correlation = (step: string): string => `playbook-staging-${runId}-${step}`;
    const identity = playbookSupabaseIdentity(config.supabaseUserId, `PLAYBOOK-STAGING-ACTOR-${runId}`);

    requireSuccess("REGISTER_SYSTEM", await client.registerSystem(PLAYBOOK_CONNECTOR_MANIFEST, correlation("register")));
    requireSuccess("CERTIFY_SYSTEM", await client.certifySystem({
        connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
        approvalId: config.bootstrap.certificationApprovalId,
        certifiedBy: "PBOS-CERTIFICATION-AUTHORITY"
    }, correlation("certify")));
    requireSuccess("REGISTER_DOMAIN", await client.registerDomain(PLAYBOOK_DOMAIN_MANIFEST, correlation("domain-register")));
    requireSuccess("ACTIVATE_DOMAIN", await client.activateDomain({
        registrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
        approvalId: config.bootstrap.domainApprovalId
    }, correlation("domain-activate")));
    requireSuccess("REGISTER_IDENTITY", await client.registerIdentity(identity, correlation("identity")));
    const capabilities = requireSuccess("DISCOVER_CAPABILITIES", await client.discoverCapabilities({
        connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
        grantedPermissions: PLAYBOOK_CONNECTOR_MANIFEST.permissions
    }, correlation("capabilities")));
    const healthCorrelation = correlation("health");
    const health = requireSuccess("HEALTH_CHECK", await client.healthCheck({
        connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
        domainRegistrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
        identityMappingId: identity.mappingId,
        purpose: "Verify the live governed Playbook staging connector.",
        correlationId: healthCorrelation
    }));
    const lifecycleCorrelation = correlation("onboarding");
    requireSuccess("PUBLISH_LIFECYCLE_EVENT", await client.publishLifecycleEvent({
        connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
        domainRegistrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
        identityMappingId: identity.mappingId,
        purpose: "Publish an approved Scholar staging onboarding milestone.",
        correlationId: lifecycleCorrelation,
        payload: { eventType: "SCHOLAR_ONBOARDING_COMPLETED", schemaVersion: "1.0.0" }
    }, lifecycleCorrelation));
    const exchangeCorrelation = correlation("dashboard");
    requireSuccess("EXCHANGE_APPROVED_DATA", await client.exchangeApprovedData({
        connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
        domainRegistrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
        identityMappingId: identity.mappingId,
        purpose: "Project approved Scholar staging state to the dashboard.",
        correlationId: exchangeCorrelation,
        payload: { schemaVersion: "1.0.0", sectionIds: ["identity", "goals"] },
        dataClassification: "PRIVATE",
        exchangeApprovalId: config.exchangeApprovalId
    }, exchangeCorrelation));
    const audit = requireSuccess("QUERY_AUDIT", await client.queryAudit({
        connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
        limit: 100
    }, correlation("audit")));

    return {
        systemId: PLAYBOOK_CONNECTOR_MANIFEST.externalSystemId,
        osId: PLAYBOOK_CONNECTOR_MANIFEST.pbosSystemId,
        connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
        domainId: PLAYBOOK_DOMAIN_MANIFEST.domainId,
        identityMappingId: identity.mappingId,
        correlations: { health: healthCorrelation, lifecycle: lifecycleCorrelation, exchange: exchangeCorrelation },
        capabilities,
        health,
        audit
    };
}

if (require.main === module) {
    void activatePlaybookStaging(playbookStagingActivationConfig()).then(result => {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch(error => {
        process.stderr.write(`Playbook staging activation failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
