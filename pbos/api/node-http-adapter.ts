import { IncomingMessage, ServerResponse } from "http";
import { PbosApiRequest } from "../connector-sdk";
import { PbosV1Api } from "./pbos-v1-api";

export class PbosNodeHttpAdapter {
    constructor(private readonly api: PbosV1Api, private readonly route = "/pbos/v1") {}

    async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
        if (request.method !== "POST" || request.url !== this.route) {
            this.respond(response, 404, { error: "PBOS API route not found." });
            return;
        }
        try {
            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as PbosApiRequest;
            const result = await this.api.handle(payload);
            this.respond(response, result.success ? 200 : 400, result);
        } catch (error) {
            this.respond(response, 400, { error: error instanceof Error ? error.message : String(error) });
        }
    }

    private respond(response: ServerResponse, statusCode: number, body: unknown): void {
        response.statusCode = statusCode;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(body));
    }
}
