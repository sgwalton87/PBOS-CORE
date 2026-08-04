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
import { PLAYBOOK_CONNECTOR_MANIFEST } from "../../reference-systems";
import { PbosIntegrationService, PbosNodeHttpAdapter, PbosV1Api } from "../index";

const services: PbosIntegrationService[] = [];
afterEach(async () => {
    await Promise.all(services.splice(0).map(service => service.stop()));
});

describe("CIP-045 authenticated PBOS integration service", () => {
    it("accepts a signed Playbook registration across the HTTP process boundary and rejects anonymous requests", async () => {
        const credentials = new InMemoryConnectorCredentialRegistry();
        const secrets = new InMemoryConnectorSecretProvider();
        const issued = new ConnectorCredentialAuthority(credentials, secrets,
            request => request.approvalId === "PLAYBOOK-CREDENTIAL-APPROVAL-001").issue({
            organizationId: "PLAYBOOK-ORG-001",
            connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
            scopes: ["REGISTER_SYSTEM"],
            durationMinutes: 15,
            issuedBy: "PBOS-CREDENTIAL-AUTHORITY",
            approvalId: "PLAYBOOK-CREDENTIAL-APPROVAL-001"
        });
        const api = new PbosV1Api(() => false, () => false, (actorId, action) => ({
            allowed: false, actorId, action, reason: "Not required for registration."
        }), new InMemoryIntegrationStateRepository(), "PLAYBOOK-ORG-001");
        const adapter = new PbosNodeHttpAdapter(api, "/pbos/v1",
            new ConnectorHmacAuthenticator(credentials, secrets, new InMemoryReplayNonceStore()),
            new ConnectorRateLimiter(20, 60_000));
        const service = new PbosIntegrationService(adapter);
        services.push(service);
        const address = await service.start();
        const request = { apiVersion: "v1" as const, operation: "REGISTER_SYSTEM" as const,
            correlationId: "playbook-http-register-001", payload: PLAYBOOK_CONNECTOR_MANIFEST,
            idempotencyKey: "playbook-http-register-001" };
        const body = Buffer.from(JSON.stringify(request));

        const anonymous = await fetch(address.endpoint, { method: "POST",
            headers: { "content-type": "application/json" }, body });
        expect(anonymous.status).toBe(401);

        const timestamp = new Date().toISOString();
        const headers = signConnectorRequest({ method: "POST", path: "/pbos/v1", body,
            organizationId: "PLAYBOOK-ORG-001", connectorId: PLAYBOOK_CONNECTOR_MANIFEST.connectorId,
            keyId: issued.credential.keyId, timestamp, nonce: "playbook-http-nonce-001", secret: issued.secret });
        const response = await fetch(address.endpoint, { method: "POST",
            headers: { "content-type": "application/json", ...headers }, body });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ success: true,
            correlationId: "playbook-http-register-001",
            provenance: expect.arrayContaining(["PBOS-V1", "REGISTER_SYSTEM"]) });
    });
});
