import { readFileSync } from "node:fs";

export interface FailureInjectionObservation {
    readonly dependency: string;
    readonly attempts: number;
    readonly denied: number;
    readonly sensitiveDataExposed: boolean;
}

export interface RuntimeResilienceObservation {
    readonly service: string;
    readonly scenarioId: string;
    readonly totalRequests: number;
    readonly minimumRequests: number;
    readonly successfulRequests: number;
    readonly rateLimitedRequests: number;
    readonly unexpectedFailures: number;
    readonly configuredConcurrency: number;
    readonly peakConcurrency: number;
    readonly p95LatencyMs: number;
    readonly maximumP95LatencyMs: number;
    readonly anonymousConnectorStatus: number;
    readonly stateDigestBefore: string;
    readonly stateDigestAfter: string;
    readonly failureInjections: readonly FailureInjectionObservation[];
    readonly startedAt: string;
    readonly completedAt: string;
}

const sha256 = /^sha256:[a-f0-9]{64}$/;
const whole = (value: number): boolean => Number.isInteger(value) && value >= 0;

export function verifyRuntimeResilience(observation: RuntimeResilienceObservation): unknown {
    if (!observation.service.trim() || !observation.scenarioId.trim()) {
        throw new Error("Resilience evidence requires service and scenario identity.");
    }
    const counts = [observation.totalRequests, observation.minimumRequests, observation.successfulRequests,
        observation.rateLimitedRequests, observation.unexpectedFailures, observation.configuredConcurrency,
        observation.peakConcurrency];
    if (counts.some(value => !whole(value)) || observation.minimumRequests === 0 || observation.configuredConcurrency === 0) {
        throw new Error("Resilience counters and limits must be non-negative integers with non-zero targets.");
    }
    if (observation.totalRequests < observation.minimumRequests || observation.successfulRequests === 0) {
        throw new Error("Resilience exercise did not meet its approved request-volume target.");
    }
    if (observation.successfulRequests + observation.rateLimitedRequests !== observation.totalRequests) {
        throw new Error("Every resilience request must be classified as successful or rate limited.");
    }
    if (observation.rateLimitedRequests === 0 || observation.peakConcurrency > observation.configuredConcurrency) {
        throw new Error("Rate or concurrency enforcement was not proven.");
    }
    if (observation.unexpectedFailures !== 0) throw new Error("Resilience exercise contains unexpected failures.");
    if (observation.p95LatencyMs < 0 || observation.maximumP95LatencyMs <= 0
        || observation.p95LatencyMs > observation.maximumP95LatencyMs) {
        throw new Error("Observed p95 latency exceeds the approved boundary.");
    }
    if (observation.anonymousConnectorStatus !== 401) throw new Error("Protected connector boundary did not fail closed.");
    if (!sha256.test(observation.stateDigestBefore) || observation.stateDigestBefore !== observation.stateDigestAfter) {
        throw new Error("Durable runtime state changed during the resilience exercise.");
    }
    if (observation.failureInjections.length === 0 || observation.failureInjections.some(injection =>
        !injection.dependency.trim() || !whole(injection.attempts) || injection.attempts === 0
        || injection.denied !== injection.attempts || injection.sensitiveDataExposed)) {
        throw new Error("Dependency failure injection did not deny every attempt without data exposure.");
    }
    const startedAt = Date.parse(observation.startedAt);
    const completedAt = Date.parse(observation.completedAt);
    if (Number.isNaN(startedAt) || Number.isNaN(completedAt) || completedAt < startedAt) {
        throw new Error("Resilience evidence contains an invalid execution window.");
    }
    return {
        evidenceId: `PBOS-RESILIENCE-${observation.scenarioId.toUpperCase()}-001`,
        service: observation.service,
        scenarioId: observation.scenarioId,
        totalRequests: observation.totalRequests,
        successfulRequests: observation.successfulRequests,
        rateLimitedRequests: observation.rateLimitedRequests,
        peakConcurrency: observation.peakConcurrency,
        p95LatencyMs: observation.p95LatencyMs,
        stateDigest: observation.stateDigestAfter,
        failureInjections: observation.failureInjections.map(item => item.dependency),
        startedAt: observation.startedAt,
        completedAt: observation.completedAt
    };
}

export function verifyRuntimeResilienceFile(path = process.env.PBOS_RESILIENCE_EVIDENCE_PATH?.trim()): unknown {
    if (!path) throw new Error("Required resilience evidence path is missing: PBOS_RESILIENCE_EVIDENCE_PATH");
    return verifyRuntimeResilience(JSON.parse(readFileSync(path, "utf8")) as RuntimeResilienceObservation);
}

if (require.main === module) {
    try { process.stdout.write(`${JSON.stringify(verifyRuntimeResilienceFile(), null, 2)}\n`); }
    catch (error) {
        process.stderr.write(`Runtime resilience evidence failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
