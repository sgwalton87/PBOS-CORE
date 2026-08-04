import { randomBytes, randomUUID } from "crypto";
import { JsonStateStore } from "../../genesis-state/json-state-store";
import {
    ConnectorCredential, ConnectorCredentialIssueRequest, ConnectorCredentialRegistry, ConnectorSecretProvider
} from "./contracts";

export type ConnectorCredentialApproval = (request: ConnectorCredentialIssueRequest) => boolean;

export class InMemoryConnectorCredentialRegistry implements ConnectorCredentialRegistry {
    private readonly credentials = new Map<string, ConnectorCredential>();
    save(credential: ConnectorCredential): void { this.credentials.set(credential.keyId, credential); }
    get(keyId: string): ConnectorCredential | undefined { return this.credentials.get(keyId); }
    forConnector(organizationId: string, connectorId: string): readonly ConnectorCredential[] {
        return [...this.credentials.values()].filter(item => item.organizationId === organizationId && item.connectorId === connectorId);
    }
}

interface DurableCredentialState { readonly credentials: readonly ConnectorCredential[]; }
const reviveCredential = (credential: ConnectorCredential): ConnectorCredential => ({ ...credential,
    issuedAt: new Date(String(credential.issuedAt)), expiresAt: new Date(String(credential.expiresAt)) });

export class FileConnectorCredentialRegistry implements ConnectorCredentialRegistry {
    private readonly store: JsonStateStore<DurableCredentialState>;
    constructor(path: string) { this.store = new JsonStateStore(path, () => ({ credentials: [] })); }
    save(credential: ConnectorCredential): void {
        this.store.update(state => ({ credentials: [...state.credentials.filter(item => item.keyId !== credential.keyId), credential] }));
    }
    get(keyId: string): ConnectorCredential | undefined {
        const value = this.store.read().credentials.find(item => item.keyId === keyId);
        return value ? reviveCredential(value) : undefined;
    }
    forConnector(organizationId: string, connectorId: string): readonly ConnectorCredential[] {
        return this.store.read().credentials.filter(item => item.organizationId === organizationId && item.connectorId === connectorId)
            .map(reviveCredential);
    }
}

export class InMemoryConnectorSecretProvider implements ConnectorSecretProvider {
    private readonly secrets = new Map<string, Uint8Array>();
    resolve(keyId: string): Uint8Array | undefined { return this.secrets.get(keyId); }
    store(keyId: string, secret: Uint8Array): void { this.secrets.set(keyId, Uint8Array.from(secret)); }
    remove(keyId: string): void { this.secrets.delete(keyId); }
}

export class ConnectorCredentialAuthority {
    constructor(private readonly registry: ConnectorCredentialRegistry, private readonly secrets: ConnectorSecretProvider,
        private readonly approve: ConnectorCredentialApproval) {}

    issue(request: ConnectorCredentialIssueRequest): { credential: ConnectorCredential; secret: Uint8Array } {
        if (!request.organizationId || !request.connectorId || !request.issuedBy || !request.approvalId || request.scopes.length === 0 ||
            !Number.isFinite(request.durationMinutes) || request.durationMinutes <= 0 || !this.approve(request)) {
            throw new Error("Connector credential issuance denied by governance authority.");
        }
        const keyId = `pbos_${randomUUID()}`;
        const secret = randomBytes(32);
        const issuedAt = new Date();
        const credential: ConnectorCredential = { credentialId: randomUUID(), organizationId: request.organizationId,
            connectorId: request.connectorId, keyId, scopes: [...new Set(request.scopes)], status: "ACTIVE",
            issuedBy: request.issuedBy, approvalId: request.approvalId, issuedAt,
            expiresAt: new Date(issuedAt.getTime() + request.durationMinutes * 60_000) };
        this.registry.save(credential);
        this.secrets.store(keyId, secret);
        return { credential, secret: Uint8Array.from(secret) };
    }

    rotate(keyId: string, request: ConnectorCredentialIssueRequest): { credential: ConnectorCredential; secret: Uint8Array } {
        const current = this.require(keyId);
        if (current.organizationId !== request.organizationId || current.connectorId !== request.connectorId) {
            throw new Error("Credential rotation cannot change connector ownership.");
        }
        const next = this.issue(request);
        this.registry.save({ ...current, status: "REVOKED", replacedByKeyId: next.credential.keyId });
        this.secrets.remove(keyId);
        return next;
    }

    suspend(keyId: string): ConnectorCredential { return this.transition(keyId, "SUSPENDED", false); }
    revoke(keyId: string): ConnectorCredential { return this.transition(keyId, "REVOKED", true); }
    private transition(keyId: string, status: "SUSPENDED" | "REVOKED", removeSecret: boolean): ConnectorCredential {
        const updated = { ...this.require(keyId), status };
        this.registry.save(updated);
        if (removeSecret) this.secrets.remove(keyId);
        return updated;
    }
    private require(keyId: string): ConnectorCredential {
        const credential = this.registry.get(keyId);
        if (!credential) throw new Error(`Connector credential not found: ${keyId}`);
        return credential;
    }
}
