import { readFileSync } from "node:fs";
import { PbosConnectorClient, PbosHttpTransport, PbosApiResponse } from "../connector-sdk";
import { PLAYBOOK_CONNECTOR_MANIFEST, PLAYBOOK_DOMAIN_MANIFEST } from "../reference-systems";

type LifecycleMode = "SUSPEND" | "VERIFY_DENIED" | "RESUME";

interface LifecycleBootstrap {
    readonly organizationId: string;
    readonly connectorId: string;
    readonly keyId: string;
    readonly secretBase64: string;
    readonly expiresAt: string;
    readonly lifecycleApprovalId: string;
}

const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Required Playbook lifecycle configuration is missing: ${name}`);
    return value;
};

const requireSuccess = <T>(operation: string, response: PbosApiResponse<T>): T => {
    if (!response.success) throw new Error(`${operation} failed: ${response.error.code} ${response.error.message}`);
    return response.output;
};

export async function runPlaybookStagingLifecycle(): Promise<unknown> {
    const mode = required("PBOS_PLAYBOOK_LIFECYCLE_MODE") as LifecycleMode;
    if (!(["SUSPEND", "VERIFY_DENIED", "RESUME"] as const).includes(mode)) {
        throw new Error(`Unsupported Playbook lifecycle mode: ${mode}`);
    }
    const endpoint = new URL("/pbos/v1", required("PBOS_STAGING_ENDPOINT")).toString();
    const bootstrap = JSON.parse(readFileSync(required("PBOS_PLAYBOOK_BOOTSTRAP_PATH"), "utf8")) as LifecycleBootstrap;
    if (bootstrap.organizationId !== "PLAYBOOK-ORG-001" || bootstrap.connectorId !== PLAYBOOK_CONNECTOR_MANIFEST.connectorId ||
        !bootstrap.keyId || !bootstrap.lifecycleApprovalId || Buffer.from(bootstrap.secretBase64, "base64").length < 32 ||
        new Date(bootstrap.expiresAt).getTime() <= Date.now()) {
        throw new Error("Playbook lifecycle bootstrap is invalid, expired, or owned by another connector.");
    }
    const client = new PbosConnectorClient(new PbosHttpTransport(endpoint,
        async (input, init) => fetch(input, init), {
            organizationId: bootstrap.organizationId,
            connectorId: bootstrap.connectorId,
            keyId: bootstrap.keyId,
            secret: Buffer.from(bootstrap.secretBase64, "base64")
        }));
    const runId = new Date().toISOString().replace(/[^0-9]/g, "");
    const actorId = "PBOS-STAGING-LIFECYCLE-OPERATOR";
    const connectorId = PLAYBOOK_CONNECTOR_MANIFEST.connectorId;

    if (mode === "SUSPEND") {
        const connector = requireSuccess("SUSPEND_SYSTEM", await client.suspendSystem({ connectorId,
            approvalId: bootstrap.lifecycleApprovalId, actorId,
            reason: "Approved CIP-045 staging suspension and denial evidence test."
        }, `playbook-suspend-${runId}`, `playbook-suspend-${runId}`));
        return { mode, connectorId, status: (connector as { status?: unknown }).status,
            evidenceId: "PLAYBOOK-SUSPENSION-20260804-001" };
    }

    if (mode === "VERIFY_DENIED") {
        const connector = requireSuccess("GET_CONNECTOR_STATUS", await client.connectorStatus({ connectorId },
            `playbook-denial-status-${runId}`));
        const health = await client.healthCheck({ connectorId,
            domainRegistrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
            identityMappingId: "PLAYBOOK-IDENTITY-pbos-staging-scholar-001",
            purpose: "Prove a suspended connector cannot execute a governed runtime health operation.",
            correlationId: `playbook-denial-health-${runId}`
        });
        if (health.success || health.error.code !== "AUTHORITY_DENIED" || !/not active and certified/i.test(health.error.message)) {
            throw new Error("Suspended Playbook connector did not produce the required runtime denial.");
        }
        return { mode, connectorId, status: (connector as { status?: unknown }).status,
            denialCode: health.error.code, denialReason: health.error.message,
            evidenceId: "PLAYBOOK-DENIAL-20260804-001" };
    }

    const connector = requireSuccess("RESUME_SYSTEM", await client.resumeSystem({ connectorId,
        approvalId: bootstrap.lifecycleApprovalId, actorId,
        reason: "Approved resume after successful CIP-045 staging denial and persistence proof."
    }, `playbook-resume-${runId}`, `playbook-resume-${runId}`));
    const health = requireSuccess("HEALTH_CHECK", await client.healthCheck({ connectorId,
        domainRegistrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
        identityMappingId: "PLAYBOOK-IDENTITY-pbos-staging-scholar-001",
        purpose: "Confirm governed Playbook health after approved resume.",
        correlationId: `playbook-resume-health-${runId}`
    }));
    return { mode, connectorId, status: (connector as { status?: unknown }).status,
        health, evidenceId: "PLAYBOOK-RESUME-20260804-001" };
}

if (require.main === module) {
    void runPlaybookStagingLifecycle().then(result => {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch(error => {
        process.stderr.write(`Playbook staging lifecycle evidence failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
