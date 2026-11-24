import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { auditMb03GenesisDerivative } from "../mb03-genesis-derivative-review";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function fixture() {
    const events = [1, 1, 2, 2, 3, 3].map((sequence, index) => ({
        eventId: `event-${index + 1}`,
        sequence,
        timestamp: new Date(Date.UTC(2026, 7, 9, 5, 30, index)).toISOString(),
        runId: "run-1",
        type: "STAGE_STARTED",
        payload: { step: index }
    }));
    const original = {
        systems: [], grants: [], audit: [],
        productionRuns: [{ runId: "run-1", status: "BLOCKED" }],
        secretState: { private: "unchanged-not-printed" },
        productionEvents: events
    };
    const projected = {
        ...structuredClone(original),
        productionEvents: events.map((event, index) => ({ ...event, sequence: index + 1 }))
    };
    const bytes = (object: unknown) => Buffer.from(JSON.stringify(object), "utf8");
    const source = bytes(original);
    const candidate = bytes(projected);
    const audit = (replacement = candidate, pin = digest(source)) =>
        auditMb03GenesisDerivative(source, replacement, pin, [1, 2, 3]);
    return { original, projected, source, candidate, bytes, audit };
}

describe("MB-03 immutable Genesis derivative review", () => {
    it("produces a non-authorizing receipt for an exact, sequence-only projection", () => {
        const { audit, candidate, source } = fixture();
        const report = audit();
        expect(report).toMatchObject({
            schema: "pbos.mb03.genesis-derivative-review.v1",
            status: "REVIEW_REQUIRED",
            executionAuthorized: false,
            originalSha256: digest(source),
            candidateSha256: digest(candidate),
            originalDuplicateSequences: [1, 2, 3],
            eventCount: 6,
            runCount: 1,
            renumberedEventCount: 5
        });
        expect(JSON.stringify(report)).not.toContain("unchanged-not-printed");
    });

    it("rejects a source whose exact original digest changed", () => {
        const { audit } = fixture();
        expect(() => audit(undefined, "0".repeat(64))).toThrow("review pin");
    });

    it("rejects changed non-event state, including preserved credential material", () => {
        const { audit, projected, bytes } = fixture();
        const tampered = { ...projected, secretState: { private: "replaced" } };
        expect(() => audit(bytes(tampered))).toThrow("non-event state");
    });

    it("rejects event payload changes and missing events", () => {
        const { audit, projected, bytes } = fixture();
        const altered = structuredClone(projected);
        altered.productionEvents[2].payload.step = 999;
        expect(() => audit(bytes(altered))).toThrow("historical event evidence");
        const truncated = { ...projected, productionEvents: projected.productionEvents.slice(1) };
        expect(() => audit(bytes(truncated))).toThrow("counts");
    });

    it("rejects unapproved sequence values, order, and repeated event identities", () => {
        const { audit, projected, bytes } = fixture();
        const wrongSequence = structuredClone(projected);
        wrongSequence.productionEvents[3].sequence = 99;
        expect(() => audit(bytes(wrongSequence))).toThrow("not deterministic");

        const wrongOrder = structuredClone(projected);
        [wrongOrder.productionEvents[0], wrongOrder.productionEvents[1]] =
            [wrongOrder.productionEvents[1], wrongOrder.productionEvents[0]];
        expect(() => audit(bytes(wrongOrder))).toThrow("not deterministic");

        const repeatedId = structuredClone(projected);
        repeatedId.productionEvents[5].eventId = repeatedId.productionEvents[4].eventId;
        expect(() => audit(bytes(repeatedId))).toThrow("identity");
    });

    it("rejects unexpected historical collisions before considering a derivative", () => {
        const { source, candidate } = fixture();
        expect(() => auditMb03GenesisDerivative(source, candidate, digest(source), [1, 2]))
            .toThrow("historical collisions");
    });
});
