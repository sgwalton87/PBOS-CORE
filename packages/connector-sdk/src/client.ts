import { ConnectorTransport, PbosResponse, PbosV1Operation } from "./contracts";

export interface ConnectorClientOptions { maximumAttempts?: number; delay?: (milliseconds: number) => Promise<void>; correlationId?: () => string; }
export class ConnectorSdkClient {
    constructor(private readonly transport: ConnectorTransport, private readonly options: ConnectorClientOptions = {}) {}
    async request<T>(operation: PbosV1Operation, payload: unknown,
        correlationId = this.options.correlationId?.() ?? globalThis.crypto.randomUUID(), idempotencyKey?: string): Promise<PbosResponse<T>> {
        const maximum = this.options.maximumAttempts ?? 1;
        let last: unknown;
        for (let attempt = 1; attempt <= maximum; attempt += 1) {
            try { return await this.transport.send<T>({ apiVersion: "v1", operation, correlationId, payload, idempotencyKey }); }
            catch (error) { last = error; if (attempt < maximum) await (this.options.delay ?? (ms => new Promise(r => setTimeout(r, ms))))(25 * 2 ** (attempt - 1)); }
        }
        throw last;
    }
    status<T>(connectorId: string): Promise<PbosResponse<T>> { return this.request("GET_CONNECTOR_STATUS", { connectorId }); }
    negotiate<T>(connectorId: string): Promise<PbosResponse<T>> { return this.request("NEGOTIATE_VERSION", { connectorId, supportedVersions: ["v1"] }); }
    capabilities<T>(connectorId: string, grantedPermissions: readonly string[]): Promise<PbosResponse<T>> {
        return this.request("DISCOVER_CAPABILITIES", { connectorId, grantedPermissions });
    }
    health<T>(input: { connectorId: string; domainRegistrationId: string; identityMappingId: string; purpose: string }): Promise<PbosResponse<T>> {
        const correlationId = this.options.correlationId?.() ?? globalThis.crypto.randomUUID();
        return this.request("HEALTH_CHECK", { ...input, correlationId }, correlationId);
    }
}
