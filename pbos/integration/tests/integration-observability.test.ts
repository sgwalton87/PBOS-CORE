import { describe, expect, it } from "vitest";
import { InMemoryTelemetrySink, IntegrationObservability, ServiceObjectiveEvaluator } from "../index";

const context = { organizationId: "ORG-001", systemId: "SYSTEM-001", connectorId: "CONNECTOR-001",
    operation: "DATA_EXCHANGE", correlationId: "correlation-1", provenance: ["SYSTEM-001"] };

describe("CIP-044 integration observability", () => {
    it("emits correlated logs, spans, metrics, and redacts secrets", () => {
        const sink = new InMemoryTelemetrySink();
        const telemetry = new IntegrationObservability(sink);
        const span = telemetry.start(context);
        telemetry.finish(span, "ERROR", { apiKey: "secret", failure: "dependency" });
        expect(sink.logs).toHaveLength(2);
        expect(sink.logs[1].fields).toEqual({ apiKey: "[REDACTED]", failure: "dependency" });
        expect(sink.spans[1]).toMatchObject({ traceId: "correlation-1", status: "ERROR" });
        expect(sink.metrics.map(item => item.name)).toContain("pbos_integration_latency_ms");
    });

    it("records authority denials without classified payloads", () => {
        const sink = new InMemoryTelemetrySink();
        new IntegrationObservability(sink).denial(context, "Missing approval");
        expect(sink.logs[0]).toMatchObject({ level: "WARN", message: "Integration authority denied" });
        expect(sink.metrics[0].name).toBe("pbos_integration_denials_total");
    });

    it("evaluates latency and success-rate service objectives", () => {
        const evaluator = new ServiceObjectiveEvaluator();
        expect(evaluator.evaluate({ name: "availability", target: 0.999, windowMinutes: 60, indicator: "SUCCESS_RATE" }, 0.95)?.severity)
            .toBe("WARNING");
        expect(evaluator.evaluate({ name: "latency", target: 500, windowMinutes: 5, indicator: "LATENCY_MS" }, 250)).toBeUndefined();
    });
});
