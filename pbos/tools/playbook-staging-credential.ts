import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PBOS_API_VERSION, PbosApiRequest } from "../connector-sdk";
import { signConnectorRequest } from "../integration";
import { PLAYBOOK_CONNECTOR_MANIFEST, PLAYBOOK_DOMAIN_MANIFEST } from "../reference-systems";

type CredentialExpectation = "ACTIVE" | "REVOKED";

interface CredentialBootstrap {
    readonly organizationId: string;
    readonly connectorId: string;
    readonly keyId: string;
    readonly secretBase64: string;
    readonly expiresAt: string;
}

const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Required Playbook credential configuration is missing: ${name}`);
    return value;
};

const loadBootstrap = (): CredentialBootstrap => {
    const bootstrap = JSON.parse(readFileSync(required("PBOS_PLAYBOOK_BOOTSTRAP_PATH"), "utf8")) as CredentialBootstrap;
    const secret = Buffer.from(bootstrap.secretBase64 ?? "", "base64");
    if (bootstrap.organizationId !== "PLAYBOOK-ORG-001" ||
        bootstrap.connectorId !== PLAYBOOK_CONNECTOR_MANIFEST.connectorId || !bootstrap.keyId || secret.length < 32 ||
        new Date(bootstrap.expiresAt).getTime() <= Date.now()) {
        throw new Error("Playbook credential bootstrap is invalid, expired, or owned by another connector.");
    }
    return bootstrap;
};

export async function runPlaybookStagingCredentialProbe(): Promise<unknown> {
    const expectation = required("PBOS_PLAYBOOK_CREDENTIAL_EXPECTATION") as CredentialExpectation;
    if (!(expectation === "ACTIVE" || expectation === "REVOKED")) {
        throw new Error(`Unsupported Playbook credential expectation: ${expectation}`);
    }
    const endpoint = new URL("/pbos/v1", required("PBOS_STAGING_ENDPOINT"));
    const bootstrap = loadBootstrap();
    const runId = new Date().toISOString().replace(/[^0-9]/g, "");
    const correlationId = `playbook-credential-${expectation.toLowerCase()}-${runId}`;
    const request: PbosApiRequest = {
        apiVersion: PBOS_API_VERSION,
        operation: "HEALTH_CHECK",
        correlationId,
        payload: {
            connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
            domainRegistrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
            identityMappingId: "PLAYBOOK-IDENTITY-pbos-staging-scholar-001",
            purpose: expectation === "ACTIVE"
                ? "Confirm replacement Playbook credential is active after approved rotation."
                : "Confirm retired Playbook credential is denied after approved rotation.",
            correlationId
        }
    };
    const body = Buffer.from(JSON.stringify(request));
    const headers = signConnectorRequest({
        method: "POST", path: endpoint.pathname, organizationId: bootstrap.organizationId,
        connectorId: bootstrap.connectorId, keyId: bootstrap.keyId, timestamp: new Date().toISOString(),
        nonce: randomUUID(), secret: Buffer.from(bootstrap.secretBase64, "base64"), body
    });
    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-pbos-api-version": PBOS_API_VERSION, ...headers },
        body
    });
    const output = await response.json() as Record<string, unknown>;

    if (expectation === "REVOKED") {
        const message = typeof output.error === "string" ? output.error : "";
        if (response.status !== 401 || !/credential is invalid, expired, suspended, or revoked/i.test(message)) {
            throw new Error(`Retired Playbook credential was not denied as required (HTTP ${response.status}).`);
        }
        return { expectation, connectorId: bootstrap.connectorId, keyId: bootstrap.keyId,
            httpStatus: response.status, denial: "CREDENTIAL_REVOKED", correlationId,
            evidenceId: "PLAYBOOK-CREDENTIAL-REVOCATION-20260804-001" };
    }

    if (response.status !== 200 || output.success !== true) {
        throw new Error(`Replacement Playbook credential did not complete governed health (HTTP ${response.status}).`);
    }
    const health = (output.output ?? {}) as Record<string, unknown>;
    return { expectation, connectorId: bootstrap.connectorId, keyId: bootstrap.keyId,
        httpStatus: response.status, healthy: (health.output as Record<string, unknown> | undefined)?.healthy,
        correlationId, evidenceId: "PLAYBOOK-CREDENTIAL-ROTATION-20260804-001" };
}

if (require.main === module) {
    void runPlaybookStagingCredentialProbe().then(result => {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch(error => {
        process.stderr.write(`Playbook credential evidence failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
