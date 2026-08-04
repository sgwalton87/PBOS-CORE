import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PbosV1Api } from "../../api";
import { PbosApiRequest, PbosApiResponse, PbosConnectorClient } from "../../connector-sdk";
import { FileIntegrationStateRepository } from "../../integration";
import {
    PLAYBOOK_CONNECTOR,
    PLAYBOOK_CONNECTOR_MANIFEST,
    PLAYBOOK_DOMAIN_MANIFEST,
    PLAYBOOK_DOMAIN_REGISTRATION,
    playbookSupabaseIdentity
} from "../playbook";

const temporaryDirectories: string[] = [];
afterEach(() => temporaryDirectories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

function statePath(): string {
    const directory = mkdtempSync(join(tmpdir(), "pbos-playbook-activation-"));
    temporaryDirectories.push(directory);
    return join(directory, "integration-state.json");
}

function client(path: string, options: { authority?: boolean; dependencyHealthy?: boolean } = {}): PbosConnectorClient {
    const repository = new FileIntegrationStateRepository(path);
    const api = new PbosV1Api(
        command => command.approvalId === "PLAYBOOK-CERTIFICATION-APPROVAL-001",
        command => command.approvalId === "PLAYBOOK-DOMAIN-APPROVAL-001",
        (actorId, action) => ({
            allowed: options.authority !== false,
            actorId,
            action,
            authorityId: options.authority !== false ? "PLAYBOOK-AUTHORITY-001" : undefined,
            reason: options.authority !== false ? "Governed permission granted." : "Governed permission denied."
        }),
        repository,
        "PLAYBOOK-ORG-001",
        command => command.approvalId === "PLAYBOOK-LIFECYCLE-APPROVAL-001",
        {
            LIFECYCLE_EVENT: async payload => {
                if (options.dependencyHealthy === false) throw new Error("Playbook lifecycle dependency unavailable.");
                return { accepted: true, payload };
            },
            DATA_EXCHANGE: async payload => ({ accepted: true, payload })
        }
    );
    return new PbosConnectorClient({
        send: async <TOutput>(request: PbosApiRequest) => await api.handle(request) as PbosApiResponse<TOutput>
    });
}

async function activate(sdk: PbosConnectorClient) {
    const identity = playbookSupabaseIdentity("supabase-scholar-001", "PLAYBOOK-SCHOLAR-ACTOR-001");
    expect((await sdk.registerSystem(PLAYBOOK_CONNECTOR_MANIFEST, "playbook-register")).success).toBe(true);
    expect((await sdk.certifySystem({ connectorId: PLAYBOOK_CONNECTOR.connectorId,
        approvalId: "PLAYBOOK-CERTIFICATION-APPROVAL-001", certifiedBy: "PBOS-CERTIFICATION-AUTHORITY" },
    "playbook-certify")).success).toBe(true);
    expect((await sdk.registerDomain(PLAYBOOK_DOMAIN_MANIFEST, "playbook-domain-register")).success).toBe(true);
    expect((await sdk.activateDomain({ registrationId: PLAYBOOK_DOMAIN_REGISTRATION.registrationId,
        approvalId: "PLAYBOOK-DOMAIN-APPROVAL-001" }, "playbook-domain-activate")).success).toBe(true);
    expect((await sdk.registerIdentity(identity, "playbook-identity-map")).success).toBe(true);
    return identity;
}

describe("CIP-045 Playbook production connector activation", () => {
    it("completes Scholar onboarding-to-dashboard with governed provenance and restart recovery", async () => {
        const path = statePath();
        const sdk = client(path);
        const identity = await activate(sdk);
        const base = {
            connectorId: PLAYBOOK_CONNECTOR.connectorId,
            domainRegistrationId: PLAYBOOK_DOMAIN_REGISTRATION.registrationId,
            identityMappingId: identity.mappingId,
            purpose: "Project an approved Scholar onboarding milestone to the dashboard.",
            correlationId: "playbook-scholar-journey-001",
            payload: { eventType: "SCHOLAR_ONBOARDING_COMPLETED", schemaVersion: "1.0.0" }
        };
        const lifecycle = await sdk.publishLifecycleEvent(base, "playbook-onboarding-001");
        expect(lifecycle.success).toBe(true);
        if (lifecycle.success) expect(lifecycle.provenance).toEqual(expect.arrayContaining([
            "PBOS-V1", "PUBLISH_LIFECYCLE_EVENT", base.correlationId
        ]));
        const projection = await sdk.exchangeApprovedData({ ...base,
            correlationId: "playbook-dashboard-001", dataClassification: "PRIVATE",
            exchangeApprovalId: "PLAYBOOK-DASHBOARD-APPROVAL-001" }, "playbook-dashboard-001");
        expect(projection.success).toBe(true);

        const restarted = client(path);
        const health = await restarted.healthCheck({ connectorId: PLAYBOOK_CONNECTOR.connectorId,
            domainRegistrationId: PLAYBOOK_DOMAIN_REGISTRATION.registrationId, identityMappingId: identity.mappingId,
            purpose: "Verify activation survives PBOS restart.", correlationId: "playbook-restart-health-001" });
        expect(health.success).toBe(true);
    });

    it("fails closed for self-certification, revoked authority, and degraded dependencies", async () => {
        const self = client(statePath());
        expect((await self.registerSystem(PLAYBOOK_CONNECTOR_MANIFEST, "register-self-test")).success).toBe(true);
        const deniedCertification = await self.certifySystem({ connectorId: PLAYBOOK_CONNECTOR.connectorId,
            approvalId: "PLAYBOOK-SELF-APPROVAL", certifiedBy: "PLAYBOOK-APPLICATION" }, "self-certification");
        expect(deniedCertification.success).toBe(false);

        const path = statePath();
        const sdk = client(path, { dependencyHealthy: false });
        const identity = await activate(sdk);
        const degraded = await sdk.publishLifecycleEvent({ connectorId: PLAYBOOK_CONNECTOR.connectorId,
            domainRegistrationId: PLAYBOOK_DOMAIN_REGISTRATION.registrationId, identityMappingId: identity.mappingId,
            purpose: "Prove degraded mode fails closed.", correlationId: "playbook-degraded-001",
            payload: { eventType: "SCHOLAR_ONBOARDING_COMPLETED" } }, "playbook-degraded-001");
        expect(degraded.success).toBe(false);

        const revoked = client(path, { authority: false });
        const deniedHealth = await revoked.healthCheck({ connectorId: PLAYBOOK_CONNECTOR.connectorId,
            domainRegistrationId: PLAYBOOK_DOMAIN_REGISTRATION.registrationId, identityMappingId: identity.mappingId,
            purpose: "Prove cross-process authority revocation.", correlationId: "playbook-revoked-001" });
        expect(deniedHealth.success).toBe(false);
    });
});
