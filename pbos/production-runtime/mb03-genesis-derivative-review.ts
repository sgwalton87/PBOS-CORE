/**
 * MB-03 Genesis derivative review. This is a deterministic, offline comparison
 * of two existing state snapshots, NOT a repair, approval, or migration.
 * It never writes Genesis state and never inspects operator credentials.
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

type JsonRecord = Record<string, unknown>;
type EventRecord = JsonRecord & { eventId: string; sequence: number; timestamp: string };

export interface GenesisDerivativeReceipt {
    readonly schema: "pbos.mb03.genesis-derivative-review.v1";
    readonly status: "REVIEW_REQUIRED";
    readonly originalSha256: string;
    readonly candidateSha256: string;
    readonly eventCount: number;
    readonly runCount: number;
    readonly originalDuplicateSequences: readonly number[];
    readonly renumberedEventCount: number;
    readonly mappingSha256: string;
    readonly executionAuthorized: false;
}

const sha256 = (bytes: Uint8Array | string): string =>
    createHash("sha256").update(bytes).digest("hex");

function readState(bytes: Uint8Array): JsonRecord {
    let value: unknown;
    try { value = JSON.parse(Buffer.from(bytes).toString("utf8")); }
    catch { throw new Error("Genesis derivative is not valid JSON."); }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Genesis derivative has an invalid state root.");
    }
    return value as JsonRecord;
}

function readEvents(state: JsonRecord): EventRecord[] {
    if (!Array.isArray(state.productionEvents) || !state.productionEvents.length) {
        throw new Error("Genesis derivative must contain production events.");
    }
    const ids = new Set<string>();
    return state.productionEvents.map((value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Malformed Genesis event.");
        }
        const event = value as EventRecord;
        if (typeof event.eventId !== "string" || !event.eventId ||
            !Number.isSafeInteger(event.sequence) || event.sequence < 1 ||
            typeof event.timestamp !== "string" || !Number.isFinite(Date.parse(event.timestamp)) ||
            ids.has(event.eventId)) {
            throw new Error("Genesis event identity, sequence, or timestamp is invalid.");
        }
        ids.add(event.eventId);
        return event;
    });
}

/**
 * Inspect a proposed sequence-only derivative against an exact source hash.
 * The expected historical collisions must each occur exactly twice.
 * The derivative must preserve every non-sequence byte of meaning, including
 * all operator/mission/approval records and every original event payload.
 * The order is deterministic: original sequence, timestamp, original index.
 */
export function auditMb03GenesisDerivative(
    originalBytes: Uint8Array,
    candidateBytes: Uint8Array,
    expectedOriginalSha256: string,
    expectedDuplicateSequences: readonly number[]
): GenesisDerivativeReceipt {
    if (!/^[a-f0-9]{64}$/.test(expectedOriginalSha256) ||
        sha256(originalBytes) !== expectedOriginalSha256) {
        throw new Error("Genesis source does not match the approved review pin.");
    }
    const original = readState(originalBytes);
    const candidate = readState(candidateBytes);
    const originalEvents = readEvents(original);
    const candidateEvents = readEvents(candidate);

    if (!Array.isArray(original.productionRuns) || !Array.isArray(candidate.productionRuns) ||
        originalEvents.length !== candidateEvents.length) {
        throw new Error("Genesis derivative changed run or event counts.");
    }

    // No field outside productionEvents may change, including operator secrets.
    const originalRest = { ...original };
    const candidateRest = { ...candidate };
    delete originalRest.productionEvents;
    delete candidateRest.productionEvents;
    if (!isDeepStrictEqual(originalRest, candidateRest)) {
        throw new Error("Genesis derivative modified non-event state.");
    }

    const counts = new Map<number, number>();
    for (const event of originalEvents) counts.set(event.sequence, (counts.get(event.sequence) ?? 0) + 1);
    const actualDuplicates = [...counts.entries()]
        .filter(([, count]) => count > 1).sort((a, b) => a[0] - b[0]);
    const expected = [...expectedDuplicateSequences].sort((a, b) => a - b);
    if (expected.length !== new Set(expected).size ||
        !isDeepStrictEqual(actualDuplicates.map(([sequence]) => sequence), expected) ||
        actualDuplicates.some(([, count]) => count !== 2)) {
        throw new Error("Genesis historical collisions do not match the review scope.");
    }

    const ordered = originalEvents.map((event, index) => ({ event, index }))
        .sort((left, right) => left.event.sequence - right.event.sequence ||
            Date.parse(left.event.timestamp) - Date.parse(right.event.timestamp) ||
            left.index - right.index);

    let renumberedEventCount = 0;
    const mapping: Array<{ eventId: string; originalSequence: number; projectedSequence: number }> = [];
    for (let index = 0; index < ordered.length; index += 1) {
        const originalEvent = ordered[index].event;
        const projected = candidateEvents[index];
        if (projected.eventId !== originalEvent.eventId || projected.sequence !== index + 1) {
            throw new Error("Genesis derivative sequence projection or ordering is not deterministic.");
        }
        const { sequence: previousSequence, ...originalFields } = originalEvent;
        const { sequence: proposedSequence, ...candidateFields } = projected;
        if (!isDeepStrictEqual(originalFields, candidateFields)) {
            throw new Error("Genesis derivative modified historical event evidence.");
        }
        if (previousSequence !== proposedSequence) renumberedEventCount += 1;
        mapping.push({ eventId: originalEvent.eventId, originalSequence: previousSequence, projectedSequence: proposedSequence });
    }

    return {
        schema: "pbos.mb03.genesis-derivative-review.v1",
        status: "REVIEW_REQUIRED",
        originalSha256: expectedOriginalSha256,
        candidateSha256: sha256(candidateBytes),
        eventCount: originalEvents.length,
        runCount: original.productionRuns.length,
        originalDuplicateSequences: expected,
        renumberedEventCount,
        mappingSha256: sha256(JSON.stringify(mapping)),
        executionAuthorized: false
    };
}
