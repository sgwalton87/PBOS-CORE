import { createServer, Server } from "node:http";
import { PbosNodeHttpAdapter } from "./node-http-adapter";

export interface IntegrationServiceAddress {
    readonly host: string;
    readonly port: number;
    readonly endpoint: string;
}

/** Lifecycle boundary used by deployment adapters to host the PBOS v1 API. */
export class PbosIntegrationService {
    private server?: Server;

    constructor(private readonly adapter: PbosNodeHttpAdapter,
        private readonly healthRoute = "/healthz") {}

    async start(port = 0, host = "127.0.0.1"): Promise<IntegrationServiceAddress> {
        if (this.server) throw new Error("PBOS integration service is already running.");
        const server = createServer((request, response) => {
            if (request.method === "GET" && request.url === this.healthRoute) {
                response.statusCode = 200;
                response.setHeader("content-type", "application/json");
                response.setHeader("cache-control", "no-store");
                response.setHeader("x-content-type-options", "nosniff");
                response.end(JSON.stringify({ status: "healthy", service: "pbos-v1-integration" }));
                return;
            }
            void this.adapter.handle(request, response);
        });
        this.server = server;
        await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(port, host, () => {
                server.off("error", reject);
                resolve();
            });
        });
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("PBOS integration service address unavailable.");
        return { host, port: address.port, endpoint: `http://${host}:${address.port}/pbos/v1` };
    }

    async stop(): Promise<void> {
        const server = this.server;
        if (!server) return;
        this.server = undefined;
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}
