import { randomUUID } from "crypto";
import { signConnectorRequest } from "../integration";
import { PbosApiRequest, PbosApiResponse } from "./contracts";
import { PbosConnectorTransport } from "./pbos-connector-client";

export type PbosFetch = (
    input: string,
    init: { readonly method: "POST"; readonly headers: Readonly<Record<string, string>>; readonly body: string }
) => Promise<{ readonly ok: boolean; json(): Promise<unknown> }>;

export interface PbosTransportCredentials {
    readonly organizationId: string;
    readonly connectorId: string;
    readonly keyId: string;
    readonly secret: Uint8Array;
}

export class PbosHttpTransport implements PbosConnectorTransport {
    constructor(private readonly endpoint: string, private readonly fetcher: PbosFetch,
        private readonly credentials?: PbosTransportCredentials) {
        if (!endpoint) throw new Error("PBOS API endpoint is required.");
    }

    async send<TOutput>(request: PbosApiRequest): Promise<PbosApiResponse<TOutput>> {
        const body = JSON.stringify(request);
        const path = this.endpoint.startsWith("http://") || this.endpoint.startsWith("https://")
            ? new URL(this.endpoint).pathname : this.endpoint;
        const authHeaders = this.credentials ? signConnectorRequest({ method: "POST", path,
            organizationId: this.credentials.organizationId, connectorId: this.credentials.connectorId,
            keyId: this.credentials.keyId, timestamp: new Date().toISOString(), nonce: randomUUID(),
            secret: this.credentials.secret, body: Buffer.from(body) }) : {};
        const response = await this.fetcher(this.endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "x-pbos-api-version": request.apiVersion, ...authHeaders },
            body
        });
        const output = await response.json() as PbosApiResponse<TOutput>;
        if (!response.ok && output.success) throw new Error("PBOS transport returned an inconsistent success response.");
        return output;
    }
}
