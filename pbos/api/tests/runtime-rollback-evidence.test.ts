import { describe, expect, it } from "vitest";
import { RuntimeRollbackObservation, verifyRuntimeRollback } from "../../tools/runtime-rollback-evidence";

const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const valid = (): RuntimeRollbackObservation => ({
    service: "pbos-v1-integration-staging",
    knownGoodImageDigest: digest("a"),
    candidateImageDigest: digest("b"),
    rollbackImageDigest: digest("a"),
    stateDigestBefore: digest("c"),
    stateDigestAfter: digest("c"),
    latestReadyRevision: "pbos-v1-integration-staging-rollback1",
    trafficPercent: 100,
    healthStatus: 200,
    anonymousConnectorStatus: 401,
    degradedDependencyDenied: true,
    observedAt: "2026-08-04T20:00:00.000Z"
});

describe("CIP-047 runtime rollback evidence", () => {
    it("certifies immutable rollback, state continuity, health, and fail-closed behavior", () => {
        expect(verifyRuntimeRollback(valid())).toMatchObject({
            evidenceId: "PBOS-ROLLBACK-PBOS-V1-INTEGRATION-STAGING-001",
            restoredImageDigest: digest("a"),
            healthStatus: 200,
            degradedDependencyDenied: true
        });
    });

    it("rejects rollback drift and incomplete security evidence", () => {
        expect(() => verifyRuntimeRollback({ ...valid(), rollbackImageDigest: digest("d") }))
            .toThrow("known-good immutable image");
        expect(() => verifyRuntimeRollback({ ...valid(), stateDigestAfter: digest("d") }))
            .toThrow("state changed");
        expect(() => verifyRuntimeRollback({ ...valid(), anonymousConnectorStatus: 200 }))
            .toThrow("fail-closed");
    });
});
