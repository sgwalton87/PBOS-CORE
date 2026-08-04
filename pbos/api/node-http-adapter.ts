import { IncomingMessage, ServerResponse } from "http";
import { PbosApiRequest } from "../connector-sdk";
import { ConnectorRateLimiter, ConnectorRequestAuthenticator } from "../integration";
import { PbosV1Api } from "./pbos-v1-api";

export class PbosNodeHttpAdapter {
    constructor(private readonly api: PbosV1Api, private readonly route = "/pbos/v1",
        private readonly authenticator?: ConnectorRequestAuthenticator,
        private readonly rateLimiter?: ConnectorRateLimiter,
        private readonly maximumBodyBytes = 1_048_576,
        private readonly allowedOrigins: readonly string[] = [],
        private readonly requestTimeoutMs = 15_000) {}

    async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
        if (request.method !== "POST" || request.url !== this.route) {
            this.respond(response, 404, { error: "PBOS API route not found." });
            return;
        }
        try {
            request.setTimeout(this.requestTimeoutMs, () => request.destroy(new Error("PBOS request timed out.")));
            const origin = request.headers.origin;
            if (origin && !this.allowedOrigins.includes(origin)) throw new Error("Connector browser origin is not allowed.");
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of request) {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                size += buffer.length;
                if (size > this.maximumBodyBytes) throw new Error("PBOS request body exceeds the configured limit.");
                chunks.push(buffer);
            }
            const body = Buffer.concat(chunks);
            const authenticated = this.authenticator?.authenticate({ method: "POST", path: this.route,
                body, headers: request.headers });
            if (authenticated) this.rateLimiter?.consume(authenticated.organizationId, authenticated.connectorId);
            const payload = JSON.parse(body.toString("utf8")) as PbosApiRequest;
            if (authenticated && !authenticated.scopes.includes("*") && !authenticated.scopes.includes(payload.operation)) {
                throw new Error(`Connector credential scope denies operation: ${payload.operation}`);
            }
            const requestedConnectorId = (payload.payload as { connectorId?: unknown } | undefined)?.connectorId;
            if (authenticated && typeof requestedConnectorId === "string" &&
                requestedConnectorId !== authenticated.connectorId) {
                throw new Error("Connector authentication does not authorize a different connector boundary.");
            }
            const result = await this.api.handle(payload);
            this.respond(response, result.success ? 200 : 400, result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const status = /body exceeds/i.test(message) ? 413 : /rate limit/i.test(message) ? 429
                : /origin is not allowed/i.test(message) ? 403
                : /authentication|credential|signature|timestamp|replay|scope denies/i.test(message) ? 401 : 400;
            this.respond(response, status, { error: message });
        }
    }

    private respond(response: ServerResponse, statusCode: number, body: unknown): void {
        response.statusCode = statusCode;
        response.setHeader("content-type", "application/json");
        response.setHeader("cache-control", "no-store");
        response.setHeader("x-content-type-options", "nosniff");
        response.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
        response.setHeader("referrer-policy", "no-referrer");
        response.end(JSON.stringify(body));
    }
}
