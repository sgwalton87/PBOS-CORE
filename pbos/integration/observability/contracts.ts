export interface IntegrationTelemetryContext {
    organizationId: string; systemId?: string; connectorId: string; operation: string; correlationId: string; provenance: readonly string[];
}
export interface StructuredLog { timestamp: Date; level: "INFO" | "WARN" | "ERROR"; message: string; context: IntegrationTelemetryContext; fields: Record<string, unknown>; }
export interface TraceSpan { traceId: string; spanId: string; parentSpanId?: string; name: string; context: IntegrationTelemetryContext;
    startedAt: Date; endedAt?: Date; status: "ACTIVE" | "OK" | "ERROR"; attributes: Record<string, unknown>; }
export interface MetricPoint { name: string; kind: "COUNTER" | "GAUGE" | "HISTOGRAM"; value: number; labels: Record<string, string>; recordedAt: Date; }
export interface TelemetrySink { log(record: StructuredLog): void; span(record: TraceSpan): void; metric(record: MetricPoint): void; }
export interface ServiceObjective { name: string; target: number; windowMinutes: number; indicator: "SUCCESS_RATE" | "LATENCY_MS" | "DENIAL_RATE"; }
export interface Alert { alertId: string; severity: "WARNING" | "CRITICAL"; objective: string; message: string; observed: number; threshold: number; occurredAt: Date; }
