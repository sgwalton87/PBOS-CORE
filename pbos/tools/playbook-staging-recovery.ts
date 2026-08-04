import { readFileSync } from "node:fs";
import { PbosConnectorClient, PbosHttpTransport, PbosApiResponse } from "../connector-sdk";
import { PLAYBOOK_CONNECTOR_MANIFEST, PLAYBOOK_DOMAIN_MANIFEST } from "../reference-systems";

interface RecoveryBootstrap {
    readonly organizationId: string;
    readonly connectorId: string;
    readonly keyId: string;
    readonly secretBase64: string;
    readonly expiresAt: string;
}

const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Required Playbook recovery configuration is missing: ${name}`);
    return value;
};

const requireSuccess = <T>(operation: string, response: PbosApiResponse<T>): T => {
    if (!response.success) throw new Error(`${operation} failed: ${response.error.code} ${response.error.message}`);
    return response.output;
};

export async function verifyPlaybookStagingRecovery(): Promise<unknown> {
    const endpoint = new URL("/pbos/v1", required("PBOS_STAGING_ENDPOINT")).toString();
    const bootstrap = JSON.parse(readFileSync(required("PBOS_PLAYBOOK_BOOTSTRAP_PATH"), "utf8")) as RecoveryBootstrap;
    if (bootstrap.organizationId !== "PLAYBOOK-ORG-001" || bootstrap.connectorId !== PLAYBOOK_CONNECTOR_MANIFEST.connectorId ||
        !bootstrap.keyId || Buffer.from(bootstrap.secretBase64, "base64").length < 32 ||
        new Date(bootstrap.expiresAt).getTime() <= Date.now()) {
        throw new Error("Playbook recovery bootstrap is invalid, expired, or owned by another connector.");
    }
    const client = new PbosConnectorClient(new PbosHttpTransport(endpoint,
        async (input, init) => fetch(input, init), {
            organizationId: bootstrap.organizationId,
            connectorId: bootstrap.connectorId,
            keyId: bootstrap.keyId,
            secret: Buffer.from(bootstrap.secretBase64, "base64")
        }));
    const correlation = `playbook-recovery-${new Date().toISOString().replace(/[^0-9]/g, "")}`;
    const connector = requireSuccess("GET_CONNECTOR_STATUS", await client.connectorStatus({
        connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId
    }, `${correlation}-connector`));
    const domain = requireSuccess("GET_DOMAIN_STATUS", await client.domainStatus({
        registrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId
    }, `${correlation}-domain`));
    const audit = requireSuccess("QUERY_AUDIT", await client.queryAudit({
        connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
        limit: 100
    }, `${correlation}-audit`)) as readonly unknown[];
    if (audit.length < 3) throw new Error("Playbook recovery requires the prior live audit evidence.");
    return {
        connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
        connectorStatus: (connector as { status?: unknown }).status,
        certification: (connector as { certification?: unknown }).certification,
        domainRegistrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
        domainStatus: (domain as { status?: unknown }).status,
        recoveredAuditEvents: audit.length,
        correlation
    };
}

if (require.main === module) {
    void verifyPlaybookStagingRecovery().then(result => {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch(error => {
        process.stderr.write(`Playbook staging recovery verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
