import { afterEach, describe, expect, it } from "vitest";
import {
    ConnectorCredentialAuthority,
    ConnectorHmacAuthenticator,
    ConnectorRateLimiter,
    InMemoryConnectorCredentialRegistry,
    InMemoryConnectorSecretProvider,
    InMemoryIntegrationStateRepository,
    InMemoryReplayNonceStore,
    signConnectorRequest
} from "../../integration";
import { PbosApiRequest } from "../../connector-sdk";
import {
    PLAYBOOK_CONNECTOR_MANIFEST,
    PLAYBOOK_DOMAIN_MANIFEST,
    playbookSupabaseIdentity
} from "../../reference-systems";
import { PbosIntegrationService, PbosNodeHttpAdapter, PbosV1Api } from "../index";

const services: PbosIntegrationService[] = [];
afterEach(async () => {
    await Promise.all(services.splice(0).map(service => service.stop()));
});

describe("CIP-045 authenticated PBOS integration service", () => {
    it("completes the signed Playbook Scholar transaction across HTTP and rejects anonymous requests", async () => {
        const credentials = new InMemoryConnectorCredentialRegistry();
        const secrets = new InMemoryConnectorSecretProvider();
        const issued = new ConnectorCredentialAuthority(credentials, secrets,
            request => request.approvalId === "PLAYBOOK-CREDENTIAL-APPROVAL-001").issue({
            organizationId: "PLAYBOOK-ORG-001",
            connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
            scopes: ["REGISTER_SYSTEM", "CERTIFY_SYSTEM", "REGISTER_DOMAIN", "ACTIVATE_DOMAIN",
                "REGISTER_IDENTITY", "PUBLISH_LIFECYCLE_EVENT", "EXCHANGE_APPROVED_DATA", "QUERY_AUDIT",
                "GET_CONNECTOR_STATUS"],
            durationMinutes: 15,
            issuedBy: "PBOS-CREDENTIAL-AUTHORITY",
            approvalId: "PLAYBOOK-CREDENTIAL-APPROVAL-001"
        });
        const api = new PbosV1Api(
            command => command.approvalId === "PLAYBOOK-CERTIFICATION-APPROVAL-001",
            command => command.approvalId === "PLAYBOOK-DOMAIN-APPROVAL-001",
            (actorId, action) => ({ allowed: true, actorId, action,
                authorityId: "PLAYBOOK-AUTHORITY-001", reason: "Governed permission granted." }),
            new InMemoryIntegrationStateRepository(), "PLAYBOOK-ORG-001", () => false, {
                LIFECYCLE_EVENT: async payload => ({ accepted: true, payload }),
                DATA_EXCHANGE: async payload => ({ accepted: true, payload })
            }
        );
        const adapter = new PbosNodeHttpAdapter(api, "/pbos/v1",
            new ConnectorHmacAuthenticator(credentials, secrets, new InMemoryReplayNonceStore()),
            new ConnectorRateLimiter(20, 60_000));
        const service = new PbosIntegrationService(adapter);
        services.push(service);
        const address = await service.start();
        const request: PbosApiRequest = { apiVersion: "v1", operation: "REGISTER_SYSTEM",
            correlationId: "playbook-http-register-001", payload: PLAYBOOK_CONNECTOR_MANIFEST,
            idempotencyKey: "playbook-http-register-001" };
        const body = Buffer.from(JSON.stringify(request));

        const anonymous = await fetch(address.endpoint, { method: "POST",
            headers: { "content-type": "application/json" }, body });
        expect(anonymous.status).toBe(401);

        let nonce = 0;
        const send = async (message: PbosApiRequest): Promise<Response> => {
            const signedBody = Buffer.from(JSON.stringify(message));
            nonce += 1;
            const headers = signConnectorRequest({ method: "POST", path: "/pbos/v1", body: signedBody,
                organizationId: "PLAYBOOK-ORG-001", connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
                keyId: issued.credential.keyId, timestamp: new Date().toISOString(),
                nonce: `playbook-http-nonce-${nonce}`, secret: issued.secret });
            return await fetch(address.endpoint, { method: "POST",
                headers: { "content-type": "application/json", ...headers }, body: signedBody });
        };
        const response = await send(request);
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ success: true,
            correlationId: "playbook-http-register-001",
            provenance: expect.arrayContaining(["PBOS-V1", "REGISTER_SYSTEM"]) });

        const crossConnector = await send({ apiVersion: "v1", operation: "GET_CONNECTOR_STATUS",
            correlationId: "playbook-cross-connector-denial-001",
            payload: { connectorId: "BULLETPROOF-CONNECTOR-001" } });
        expect(crossConnector.status).toBe(401);
        await expect(crossConnector.json()).resolves.toMatchObject({
            error: "Connector authentication does not authorize a different connector boundary."
        });

        const identity = playbookSupabaseIdentity("supabase-scholar-http-001", "PLAYBOOK-SCHOLAR-HTTP-ACTOR-001");
        const operations: PbosApiRequest[] = [
            { apiVersion: "v1", operation: "CERTIFY_SYSTEM", correlationId: "playbook-http-certify-001",
                payload: { connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
                    approvalId: "PLAYBOOK-CERTIFICATION-APPROVAL-001", certifiedBy: "PBOS-CERTIFICATION-AUTHORITY" } },
            { apiVersion: "v1", operation: "REGISTER_DOMAIN", correlationId: "playbook-http-domain-register-001",
                payload: PLAYBOOK_DOMAIN_MANIFEST },
            { apiVersion: "v1", operation: "ACTIVATE_DOMAIN", correlationId: "playbook-http-domain-activate-001",
                payload: { registrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
                    approvalId: "PLAYBOOK-DOMAIN-APPROVAL-001" } },
            { apiVersion: "v1", operation: "REGISTER_IDENTITY", correlationId: "playbook-http-identity-001",
                payload: identity },
            { apiVersion: "v1", operation: "PUBLISH_LIFECYCLE_EVENT", correlationId: "playbook-http-onboarding-001",
                idempotencyKey: "playbook-http-onboarding-001", payload: {
                    connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
                    domainRegistrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
                    identityMappingId: identity.mappingId,
                    purpose: "Publish an approved Scholar onboarding milestone.",
                    correlationId: "playbook-http-onboarding-001",
                    payload: { eventType: "SCHOLAR_ONBOARDING_COMPLETED", schemaVersion: "1.0.0" }
                } },
            { apiVersion: "v1", operation: "EXCHANGE_APPROVED_DATA", correlationId: "playbook-http-dashboard-001",
                idempotencyKey: "playbook-http-dashboard-001", payload: {
                    connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
                    domainRegistrationId: PLAYBOOK_DOMAIN_MANIFEST.registrationId,
                    identityMappingId: identity.mappingId,
                    purpose: "Project approved Scholar state to the dashboard.",
                    correlationId: "playbook-http-dashboard-001",
                    payload: { schemaVersion: "1.0.0", sectionIds: ["identity", "goals"] },
                    dataClassification: "PRIVATE",
                    exchangeApprovalId: "PLAYBOOK-DASHBOARD-APPROVAL-001"
                } }
        ];
        for (const operation of operations) expect((await send(operation)).status).toBe(200);

        const audit = await send({ apiVersion: "v1", operation: "QUERY_AUDIT",
            correlationId: "playbook-http-audit-001", payload: { connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId } });
        expect(audit.status).toBe(200);
        await expect(audit.json()).resolves.toMatchObject({ success: true,
            output: expect.arrayContaining([
                expect.objectContaining({ correlationId: "playbook-http-onboarding-001", type: "RESPONDED" }),
                expect.objectContaining({ correlationId: "playbook-http-dashboard-001", type: "RESPONDED" })
            ]) });
    });
});
