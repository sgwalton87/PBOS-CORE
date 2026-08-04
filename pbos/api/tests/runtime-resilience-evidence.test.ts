import { describe, expect, it } from "vitest";
import { RuntimeResilienceObservation, verifyRuntimeResilience } from "../../tools/runtime-resilience-evidence";

const digest = `sha256:${"a".repeat(64)}`;
const valid = (): RuntimeResilienceObservation => ({
    service: "pbos-v1-integration-staging",
    scenarioId: "STAGING-LOAD-001",
    totalRequests: 500,
    minimumRequests: 500,
    successfulRequests: 450,
    rateLimitedRequests: 50,
    unexpectedFailures: 0,
    configuredConcurrency: 10,
    peakConcurrency: 10,
    p95LatencyMs: 240,
    maximumP95LatencyMs: 500,
    anonymousConnectorStatus: 401,
    stateDigestBefore: digest,
    stateDigestAfter: digest,
    failureInjections: [{ dependency: "STATE_STORE_UNAVAILABLE", attempts: 5, denied: 5, sensitiveDataExposed: false }],
    startedAt: "2026-08-04T21:00:00.000Z",
    completedAt: "2026-08-04T21:05:00.000Z"
});

describe("CIP-047 runtime resilience evidence", () => {
    it("certifies volume, rate, concurrency, latency, state, and fail-closed evidence", () => {
        expect(verifyRuntimeResilience(valid())).toMatchObject({
            evidenceId: "PBOS-RESILIENCE-STAGING-LOAD-001-001",
            totalRequests: 500,
            rateLimitedRequests: 50,
            failureInjections: ["STATE_STORE_UNAVAILABLE"]
        });
    });

    it("rejects missing enforcement, state drift, and unsafe failure injection", () => {
        expect(() => verifyRuntimeResilience({ ...valid(), successfulRequests: 500, rateLimitedRequests: 0 })).toThrow("enforcement");
        expect(() => verifyRuntimeResilience({ ...valid(), stateDigestAfter: `sha256:${"b".repeat(64)}` })).toThrow("state changed");
        expect(() => verifyRuntimeResilience({ ...valid(), failureInjections: [
            { dependency: "STATE_STORE_UNAVAILABLE", attempts: 5, denied: 4, sensitiveDataExposed: false }
        ] })).toThrow("did not deny every attempt");
    });
});
