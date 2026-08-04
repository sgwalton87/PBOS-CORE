export type ConnectorCredentialStatus = "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED";

export interface ConnectorCredential {
    readonly credentialId: string;
    readonly organizationId: string;
    readonly connectorId: string;
    readonly keyId: string;
    readonly scopes: readonly string[];
    readonly status: ConnectorCredentialStatus;
    readonly issuedBy: string;
    readonly approvalId: string;
    readonly issuedAt: Date;
    readonly expiresAt: Date;
    readonly replacedByKeyId?: string;
}

export interface ConnectorCredentialIssueRequest {
    readonly organizationId: string;
    readonly connectorId: string;
    readonly scopes: readonly string[];
    readonly issuedBy: string;
    readonly approvalId: string;
    readonly durationMinutes: number;
}

export interface ConnectorCredentialRegistry {
    save(credential: ConnectorCredential): void;
    get(keyId: string): ConnectorCredential | undefined;
    forConnector(organizationId: string, connectorId: string): readonly ConnectorCredential[];
}

export interface ConnectorSecretProvider {
    resolve(keyId: string): Uint8Array | undefined;
    store(keyId: string, secret: Uint8Array): void;
    remove(keyId: string): void;
}

export interface SignedConnectorRequest {
    readonly method: string;
    readonly path: string;
    readonly body: Uint8Array;
    readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

export interface AuthenticatedConnectorRequest {
    readonly organizationId: string;
    readonly connectorId: string;
    readonly keyId: string;
    readonly scopes: readonly string[];
    readonly nonce: string;
    readonly timestamp: Date;
}

export interface ConnectorRequestAuthenticator {
    authenticate(request: SignedConnectorRequest): AuthenticatedConnectorRequest;
}

export interface ReplayNonceStore {
    consume(organizationId: string, connectorId: string, nonce: string, expiresAt: Date): void;
}
