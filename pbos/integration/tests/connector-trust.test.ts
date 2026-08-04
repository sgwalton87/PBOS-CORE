import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
    ConnectorCredentialAuthority, ConnectorHmacAuthenticator, ConnectorRateLimiter, FileConnectorCredentialRegistry,
    FileIntegrationStateRepository, InMemoryConnectorSecretProvider, InMemoryReplayNonceStore,
    redactIntegrationEvidence, RepositoryReplayNonceStore, signConnectorRequest
} from "../index";

const request = { organizationId: "ORG-001", connectorId: "CONNECTOR-001", scopes: ["HEALTH_CHECK"],
    issuedBy: "operator-1", approvalId: "approval-1", durationMinutes: 60 };

describe("CIP-039 connector trust", () => {
    it("authenticates a governed signed request and rejects replay", () => {
        const registry = new FileConnectorCredentialRegistry(join(mkdtempSync(join(tmpdir(), "pbos-trust-")), "credentials.json"));
        const secrets = new InMemoryConnectorSecretProvider();
        const issued = new ConnectorCredentialAuthority(registry, secrets, candidate => candidate.approvalId === "approval-1").issue(request);
        const body = Buffer.from(JSON.stringify({ operation: "HEALTH_CHECK" }));
        const timestamp = new Date().toISOString();
        const headers = signConnectorRequest({ method: "POST", path: "/pbos/v1", body, organizationId: request.organizationId,
            connectorId: request.connectorId, keyId: issued.credential.keyId, timestamp, nonce: "nonce-1", secret: issued.secret });
        const authenticator = new ConnectorHmacAuthenticator(registry, secrets, new InMemoryReplayNonceStore());
        expect(authenticator.authenticate({ method: "POST", path: "/pbos/v1", body, headers })).toMatchObject({
            connectorId: request.connectorId, scopes: ["HEALTH_CHECK"]
        });
        expect(() => authenticator.authenticate({ method: "POST", path: "/pbos/v1", body, headers })).toThrow("replay");
    });

    it("rejects invalid signatures, expired timestamps, and unapproved issuance", () => {
        const registry = new FileConnectorCredentialRegistry(join(mkdtempSync(join(tmpdir(), "pbos-trust-denial-")), "credentials.json"));
        const secrets = new InMemoryConnectorSecretProvider();
        const authority = new ConnectorCredentialAuthority(registry, secrets, candidate => candidate.approvalId === "approval-1");
        expect(() => authority.issue({ ...request, approvalId: "self-approved" })).toThrow("governance");
        const issued = authority.issue(request);
        const body = Buffer.from("{}");
        const expired = new Date(Date.now() - 600_000).toISOString();
        const expiredHeaders = signConnectorRequest({ method: "POST", path: "/pbos/v1", body, organizationId: request.organizationId,
            connectorId: request.connectorId, keyId: issued.credential.keyId, timestamp: expired, nonce: "expired", secret: issued.secret });
        const authenticator = new ConnectorHmacAuthenticator(registry, secrets, new InMemoryReplayNonceStore());
        expect(() => authenticator.authenticate({ method: "POST", path: "/pbos/v1", body, headers: expiredHeaders })).toThrow("timestamp");
        const validTimestamp = new Date().toISOString();
        const invalidHeaders = { ...signConnectorRequest({ method: "POST", path: "/pbos/v1", body,
            organizationId: request.organizationId, connectorId: request.connectorId, keyId: issued.credential.keyId,
            timestamp: validTimestamp, nonce: "invalid", secret: issued.secret }), "x-pbos-signature": "00".repeat(32) };
        expect(() => authenticator.authenticate({ method: "POST", path: "/pbos/v1", body, headers: invalidHeaders })).toThrow("signature");
    });

    it("rotates and revokes credentials without persisting secret material", () => {
        const path = join(mkdtempSync(join(tmpdir(), "pbos-trust-rotation-")), "credentials.json");
        const registry = new FileConnectorCredentialRegistry(path);
        const secrets = new InMemoryConnectorSecretProvider();
        const authority = new ConnectorCredentialAuthority(registry, secrets, () => true);
        const first = authority.issue(request);
        const next = authority.rotate(first.credential.keyId, request);
        expect(new FileConnectorCredentialRegistry(path).get(first.credential.keyId)).toMatchObject({
            status: "REVOKED", replacedByKeyId: next.credential.keyId
        });
        expect(secrets.resolve(first.credential.keyId)).toBeUndefined();
        authority.revoke(next.credential.keyId);
        expect(secrets.resolve(next.credential.keyId)).toBeUndefined();
    });

    it("enforces tenant-scoped rate limits and redacts sensitive evidence", () => {
        const limiter = new ConnectorRateLimiter(2, 60_000);
        limiter.consume("ORG-001", "CONNECTOR-001", 1);
        limiter.consume("ORG-001", "CONNECTOR-001", 2);
        expect(() => limiter.consume("ORG-001", "CONNECTOR-001", 3)).toThrow("rate limit");
        expect(() => limiter.consume("ORG-002", "CONNECTOR-001", 3)).not.toThrow();
        expect(redactIntegrationEvidence({ authorization: "Bearer secret", nested: { apiKey: "secret", safe: "visible" } }))
            .toEqual({ authorization: "[REDACTED]", nested: { apiKey: "[REDACTED]", safe: "visible" } });
    });

    it("rejects replay across durable PBOS processes", () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-trust-replay-"));
        const path = join(root, "integration.json");
        new RepositoryReplayNonceStore(new FileIntegrationStateRepository(path))
            .consume("ORG-001", "CONNECTOR-001", "shared-nonce", new Date(Date.now() + 60_000));
        expect(() => new RepositoryReplayNonceStore(new FileIntegrationStateRepository(path))
            .consume("ORG-001", "CONNECTOR-001", "shared-nonce", new Date(Date.now() + 60_000))).toThrow("replay");
    });
});
