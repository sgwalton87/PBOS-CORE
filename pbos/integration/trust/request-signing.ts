import { createHash, createHmac, timingSafeEqual } from "crypto";
import {
    AuthenticatedConnectorRequest, ConnectorCredentialRegistry, ConnectorRequestAuthenticator, ConnectorSecretProvider,
    ReplayNonceStore, SignedConnectorRequest
} from "./contracts";
import type { IntegrationStateRepository } from "../state/contracts";

export const PBOS_AUTH_HEADERS = {
    organizationId: "x-pbos-organization-id", connectorId: "x-pbos-connector-id", keyId: "x-pbos-key-id",
    timestamp: "x-pbos-timestamp", nonce: "x-pbos-nonce", signature: "x-pbos-signature"
} as const;

const bodyDigest = (body: Uint8Array): string => createHash("sha256").update(body).digest("hex");
const canonical = (method: string, path: string, organizationId: string, connectorId: string, keyId: string,
    timestamp: string, nonce: string, body: Uint8Array): string =>
    [method.toUpperCase(), path, organizationId, connectorId, keyId, timestamp, nonce, bodyDigest(body)].join("\n");

export function signConnectorRequest(input: Omit<SignedConnectorRequest, "headers"> & {
    organizationId: string; connectorId: string; keyId: string; timestamp: string; nonce: string; secret: Uint8Array;
}): Readonly<Record<string, string>> {
    const signature = createHmac("sha256", input.secret).update(canonical(input.method, input.path, input.organizationId,
        input.connectorId, input.keyId, input.timestamp, input.nonce, input.body)).digest("hex");
    return { [PBOS_AUTH_HEADERS.organizationId]: input.organizationId, [PBOS_AUTH_HEADERS.connectorId]: input.connectorId,
        [PBOS_AUTH_HEADERS.keyId]: input.keyId, [PBOS_AUTH_HEADERS.timestamp]: input.timestamp,
        [PBOS_AUTH_HEADERS.nonce]: input.nonce, [PBOS_AUTH_HEADERS.signature]: signature };
}

export class InMemoryReplayNonceStore implements ReplayNonceStore {
    private readonly nonces = new Map<string, number>();
    consume(organizationId: string, connectorId: string, nonce: string, expiresAt: Date): void {
        const now = Date.now();
        for (const [key, expiry] of this.nonces) if (expiry <= now) this.nonces.delete(key);
        const key = `${organizationId}:${connectorId}:${nonce}`;
        if (this.nonces.has(key)) throw new Error("Connector request replay detected.");
        this.nonces.set(key, expiresAt.getTime());
    }
}

export class RepositoryReplayNonceStore implements ReplayNonceStore {
    constructor(private readonly repository: IntegrationStateRepository) {}
    consume(organizationId: string, connectorId: string, nonce: string, expiresAt: Date): void {
        this.repository.consumeReplayNonce({ organizationId, connectorId, nonce, expiresAt });
    }
}

export class ConnectorHmacAuthenticator implements ConnectorRequestAuthenticator {
    constructor(private readonly credentials: ConnectorCredentialRegistry, private readonly secrets: ConnectorSecretProvider,
        private readonly nonces: ReplayNonceStore, private readonly clockSkewMs = 300_000) {}

    authenticate(request: SignedConnectorRequest): AuthenticatedConnectorRequest {
        const header = (name: string): string => {
            const value = request.headers[name];
            if (typeof value !== "string" || !value) throw new Error(`Missing connector authentication header: ${name}`);
            return value;
        };
        const organizationId = header(PBOS_AUTH_HEADERS.organizationId);
        const connectorId = header(PBOS_AUTH_HEADERS.connectorId);
        const keyId = header(PBOS_AUTH_HEADERS.keyId);
        const timestampText = header(PBOS_AUTH_HEADERS.timestamp);
        const nonce = header(PBOS_AUTH_HEADERS.nonce);
        const supplied = header(PBOS_AUTH_HEADERS.signature);
        const timestamp = new Date(timestampText);
        if (!Number.isFinite(timestamp.getTime()) || Math.abs(Date.now() - timestamp.getTime()) > this.clockSkewMs) {
            throw new Error("Connector request timestamp is expired or invalid.");
        }
        const credential = this.credentials.get(keyId);
        const secret = this.secrets.resolve(keyId);
        if (!credential || !secret || credential.status !== "ACTIVE" || credential.expiresAt.getTime() <= Date.now() ||
            credential.organizationId !== organizationId || credential.connectorId !== connectorId) {
            throw new Error("Connector credential is invalid, expired, suspended, or revoked.");
        }
        const expected = createHmac("sha256", secret).update(canonical(request.method, request.path, organizationId,
            connectorId, keyId, timestampText, nonce, request.body)).digest();
        const suppliedBytes = Buffer.from(supplied, "hex");
        if (suppliedBytes.length !== expected.length || !timingSafeEqual(suppliedBytes, expected)) {
            throw new Error("Connector request signature is invalid.");
        }
        this.nonces.consume(organizationId, connectorId, nonce, new Date(timestamp.getTime() + this.clockSkewMs));
        return { organizationId, connectorId, keyId, scopes: credential.scopes, nonce, timestamp };
    }
}
