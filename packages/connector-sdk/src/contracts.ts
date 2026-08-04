export type PbosV1Operation = "GET_CONNECTOR_STATUS" | "NEGOTIATE_VERSION" | "DISCOVER_CAPABILITIES" | "HEALTH_CHECK";
export interface PbosRequest<T = unknown> { apiVersion: "v1"; operation: PbosV1Operation; correlationId: string; payload: T; idempotencyKey?: string; }
export type PbosResponse<T = unknown> = { success: true; apiVersion: "v1"; correlationId: string; output: T; provenance: readonly string[] }
    | { success: false; apiVersion: "v1"; correlationId: string; error: { code: string; message: string } };
export interface ConnectorTransport { send<T>(request: PbosRequest): Promise<PbosResponse<T>>; }
export interface ConnectorManifest {
    connectorId: string; externalSystemId: string; pbosSystemId: string; name: string; version: string;
    domainIds: readonly string[]; permissions: readonly string[]; communicationRules: readonly string[];
}
export interface ConformanceReport { manifest: ConnectorManifest; passed: boolean; checks: readonly { name: string; passed: boolean; details?: string }[]; }
