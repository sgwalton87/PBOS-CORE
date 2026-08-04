import { createHash, createHmac, randomUUID } from "crypto";
import { ConnectorTransport, PbosRequest, PbosResponse } from "./contracts";

export interface ServerConnectorCredentials { organizationId: string; connectorId: string; keyId: string; secret: Uint8Array; }
export type ServerFetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) =>
    Promise<{ ok: boolean; json(): Promise<unknown> }>;

export class SignedPbosServerTransport implements ConnectorTransport {
    constructor(private readonly endpoint: string, private readonly credentials: ServerConnectorCredentials,
        private readonly fetcher: ServerFetch) {}
    async send<T>(request: PbosRequest): Promise<PbosResponse<T>> {
        const body = JSON.stringify(request);
        const timestamp = new Date().toISOString();
        const nonce = randomUUID();
        const path = this.endpoint.startsWith("http") ? new URL(this.endpoint).pathname : this.endpoint;
        const digest = createHash("sha256").update(body).digest("hex");
        const canonical = ["POST", path, this.credentials.organizationId, this.credentials.connectorId,
            this.credentials.keyId, timestamp, nonce, digest].join("\n");
        const signature = createHmac("sha256", this.credentials.secret).update(canonical).digest("hex");
        const response = await this.fetcher(this.endpoint, { method: "POST", body, headers: {
            "content-type": "application/json", "x-pbos-api-version": "v1",
            "x-pbos-organization-id": this.credentials.organizationId, "x-pbos-connector-id": this.credentials.connectorId,
            "x-pbos-key-id": this.credentials.keyId, "x-pbos-timestamp": timestamp,
            "x-pbos-nonce": nonce, "x-pbos-signature": signature
        } });
        const output = await response.json() as PbosResponse<T>;
        if (!response.ok && output.success) throw new Error("PBOS transport returned an inconsistent response.");
        return output;
    }
}
