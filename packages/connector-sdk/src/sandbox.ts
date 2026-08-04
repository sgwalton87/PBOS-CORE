import { ConnectorTransport, PbosRequest, PbosResponse } from "./contracts";

export type SandboxHandler = (request: PbosRequest) => unknown | Promise<unknown>;
export class PbosSandboxTransport implements ConnectorTransport {
    readonly requests: PbosRequest[] = [];
    constructor(private readonly handlers: Readonly<Partial<Record<PbosRequest["operation"], SandboxHandler>>>) {}
    async send<T>(request: PbosRequest): Promise<PbosResponse<T>> {
        this.requests.push(request);
        const handler = this.handlers[request.operation];
        if (!handler) return { success: false, apiVersion: "v1", correlationId: request.correlationId,
            error: { code: "NOT_IMPLEMENTED", message: `Sandbox handler unavailable: ${request.operation}` } };
        return { success: true, apiVersion: "v1", correlationId: request.correlationId,
            output: await handler(request) as T, provenance: ["PBOS-SANDBOX", request.operation] };
    }
}
