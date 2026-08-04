import { readFileSync } from "node:fs";
import { PbosApiResponse, PbosConnectorClient, PbosHttpTransport } from "../connector-sdk";
import { BULLETPROOF_CONNECTOR_MANIFEST, BULLETPROOF_DOMAIN_MANIFEST, bulletproofExternalIdentity } from "../reference-systems";

interface BulletproofBootstrap {
    readonly organizationId: string;
    readonly connectorId: string;
    readonly keyId: string;
    readonly secretBase64: string;
    readonly expiresAt: string;
    readonly certificationApprovalId: string;
    readonly domainApprovalId: string;
}

const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Required Bulletproof activation configuration is missing: ${name}`);
    return value;
};

const requireSuccess = <T>(operation: string, response: PbosApiResponse<T>): T => {
    if (!response.success) throw new Error(`${operation} failed: ${response.error.code} ${response.error.message}`);
    return response.output;
};

export async function activateBulletproofStaging(): Promise<unknown> {
    const endpoint = new URL("/pbos/v1", required("PBOS_STAGING_ENDPOINT")).toString();
    const bootstrap = JSON.parse(readFileSync(required("PBOS_BULLETPROOF_BOOTSTRAP_PATH"), "utf8")) as BulletproofBootstrap;
    if (bootstrap.organizationId !== "BULLETPROOF-ORG-001" || bootstrap.connectorId !== BULLETPROOF_CONNECTOR_MANIFEST.connectorId ||
        !bootstrap.keyId || Buffer.from(bootstrap.secretBase64, "base64").length < 32 ||
        new Date(bootstrap.expiresAt).getTime() <= Date.now()) {
        throw new Error("Bulletproof bootstrap credential is invalid, expired, or owned by another connector.");
    }
    const client = new PbosConnectorClient(new PbosHttpTransport(endpoint, async (input, init) => fetch(input, init), {
        organizationId: bootstrap.organizationId, connectorId: bootstrap.connectorId, keyId: bootstrap.keyId,
        secret: Buffer.from(bootstrap.secretBase64, "base64")
    }));
    const runId = new Date().toISOString().replace(/[^0-9]/g, "");
    const correlation = (step: string): string => `bulletproof-staging-${runId}-${step}`;
    const identity = bulletproofExternalIdentity(required("PBOS_BULLETPROOF_EXTERNAL_IDENTITY_ID"));

    requireSuccess("REGISTER_SYSTEM", await client.registerSystem(BULLETPROOF_CONNECTOR_MANIFEST, correlation("register")));
    requireSuccess("CERTIFY_SYSTEM", await client.certifySystem({ connectorId: BULLETPROOF_CONNECTOR_MANIFEST.connectorId,
        approvalId: bootstrap.certificationApprovalId, certifiedBy: "PBOS-CERTIFICATION-AUTHORITY" }, correlation("certify")));
    requireSuccess("REGISTER_DOMAIN", await client.registerDomain(BULLETPROOF_DOMAIN_MANIFEST, correlation("domain-register")));
    requireSuccess("ACTIVATE_DOMAIN", await client.activateDomain({ registrationId: BULLETPROOF_DOMAIN_MANIFEST.registrationId,
        approvalId: bootstrap.domainApprovalId }, correlation("domain-activate")));
    requireSuccess("REGISTER_IDENTITY", await client.registerIdentity(identity, correlation("identity")));
    const capabilities = requireSuccess("DISCOVER_CAPABILITIES", await client.discoverCapabilities({
        connectorId: BULLETPROOF_CONNECTOR_MANIFEST.connectorId,
        grantedPermissions: BULLETPROOF_CONNECTOR_MANIFEST.permissions
    }, correlation("capabilities")));
    const health = requireSuccess("HEALTH_CHECK", await client.healthCheck({
        connectorId: BULLETPROOF_CONNECTOR_MANIFEST.connectorId,
        domainRegistrationId: BULLETPROOF_DOMAIN_MANIFEST.registrationId,
        identityMappingId: identity.mappingId,
        purpose: "Verify the independent governed Bulletproof staging connector.",
        correlationId: correlation("health")
    }));
    const audit = requireSuccess("QUERY_AUDIT", await client.queryAudit({
        connectorId: BULLETPROOF_CONNECTOR_MANIFEST.connectorId, limit: 100
    }, correlation("audit")));
    return { systemId: BULLETPROOF_CONNECTOR_MANIFEST.externalSystemId,
        osId: BULLETPROOF_CONNECTOR_MANIFEST.pbosSystemId,
        connectorId: BULLETPROOF_CONNECTOR_MANIFEST.connectorId,
        domainId: BULLETPROOF_DOMAIN_MANIFEST.domainId, identityMappingId: identity.mappingId,
        capabilities, health, audit };
}

if (require.main === module) {
    void activateBulletproofStaging().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
        .catch(error => {
            process.stderr.write(`Bulletproof staging activation failed: ${error instanceof Error ? error.message : String(error)}\n`);
            process.exitCode = 1;
        });
}
