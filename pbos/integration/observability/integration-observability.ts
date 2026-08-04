import { randomUUID } from "crypto";
import { redactIntegrationEvidence } from "../trust";
import { Alert, IntegrationTelemetryContext, MetricPoint, ServiceObjective, StructuredLog, TelemetrySink, TraceSpan } from "./contracts";

export class InMemoryTelemetrySink implements TelemetrySink {
    readonly logs: StructuredLog[] = []; readonly spans: TraceSpan[] = []; readonly metrics: MetricPoint[] = [];
    log(record: StructuredLog): void { this.logs.push(record); }
    span(record: TraceSpan): void { this.spans.push(record); }
    metric(record: MetricPoint): void { this.metrics.push(record); }
}

export class IntegrationObservability {
    constructor(private readonly sink: TelemetrySink) {}
    start(context: IntegrationTelemetryContext, parentSpanId?: string): TraceSpan {
        const span: TraceSpan = { traceId: context.correlationId, spanId: randomUUID(), parentSpanId,
            name: `pbos.integration.${context.operation.toLowerCase()}`, context, startedAt: new Date(), status: "ACTIVE", attributes: {} };
        this.sink.span(span);
        this.emit("INFO", "Integration operation started", context, {});
        this.metric("pbos_integration_requests_total", "COUNTER", 1, context);
        return span;
    }
    finish(span: TraceSpan, status: "OK" | "ERROR", fields: Record<string, unknown> = {}): TraceSpan {
        const endedAt = new Date();
        const completed = { ...span, status, endedAt, attributes: redactIntegrationEvidence(fields) as Record<string, unknown> };
        this.sink.span(completed);
        this.emit(status === "OK" ? "INFO" : "ERROR", `Integration operation ${status.toLowerCase()}`, span.context, fields);
        this.metric("pbos_integration_latency_ms", "HISTOGRAM", endedAt.getTime() - span.startedAt.getTime(), span.context);
        this.metric(`pbos_integration_${status === "OK" ? "success" : "failure"}_total`, "COUNTER", 1, span.context);
        return completed;
    }
    denial(context: IntegrationTelemetryContext, reason: string): void {
        this.emit("WARN", "Integration authority denied", context, { reason });
        this.metric("pbos_integration_denials_total", "COUNTER", 1, context);
    }
    gauge(context: IntegrationTelemetryContext, name: string, value: number): void { this.metric(name, "GAUGE", value, context); }
    private emit(level: StructuredLog["level"], message: string, context: IntegrationTelemetryContext, fields: Record<string, unknown>): void {
        this.sink.log({ timestamp: new Date(), level, message, context, fields: redactIntegrationEvidence(fields) as Record<string, unknown> });
    }
    private metric(name: string, kind: MetricPoint["kind"], value: number, context: IntegrationTelemetryContext): void {
        this.sink.metric({ name, kind, value, labels: { organizationId: context.organizationId,
            connectorId: context.connectorId, operation: context.operation }, recordedAt: new Date() });
    }
}

export class ServiceObjectiveEvaluator {
    evaluate(objective: ServiceObjective, observed: number): Alert | undefined {
        const violated = objective.indicator === "LATENCY_MS" ? observed > objective.target : observed < objective.target;
        return violated ? { alertId: randomUUID(), severity: observed > objective.target * 2 ? "CRITICAL" : "WARNING",
            objective: objective.name, message: `${objective.name} violated`, observed, threshold: objective.target, occurredAt: new Date() } : undefined;
    }
}
