/**
 * Offline, non-mutating analysis of an operator-supplied COPY of Genesis JSON state.
 * The caller supplies an explicit filename. Never discovers PBOS_STATE_HOME,
 * repairs sequences, writes state, replays events, or contacts an external service.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type HistoricalEvent = {
  eventId: string;
  sequence: number;
  runId?: string;
  [key: string]: unknown;
};

export type EventCollision = {
  sequence: number;
  offsets: number[];
  eventIds: string[];
  runIds: (string | null)[];
};

export type GenesisEventDiagnostic = {
  readonly inputSha256: string;
  readonly eventCount: number;
  readonly sequenceCollisions: readonly EventCollision[];
  readonly identityCollisions: readonly { eventId: string; offsets: number[] }[];
  readonly nonMonotonicAppendOffsets: readonly number[];
  readonly proposedStableOrder: readonly number[];
  readonly remainsUnmodified: true;
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function diagnoseGenesisEventCopy(bytes: Buffer): GenesisEventDiagnostic {
  const parsed: unknown = JSON.parse(bytes.toString("utf8"));
  if (!record(parsed) || !Array.isArray(parsed.productionEvents)) {
    throw new Error("GENESIS_COPY_INVALID: productionEvents array required; no recovery attempted");
  }
  const events: HistoricalEvent[] = parsed.productionEvents.map((value: unknown, offset: number) => {
    if (!record(value) || typeof value.eventId !== "string" || !value.eventId ||
      typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence <= 0 ||
      (value.runId !== undefined && typeof value.runId !== "string")) {
      throw new Error(`GENESIS_COPY_INVALID: event at offset ${offset} has invalid identity, sequence or runId`);
    }
    return value as HistoricalEvent;
  });
  const sequences = new Map<number, number[]>();
  const identities = new Map<string, number[]>();
  const nonMonotonicAppendOffsets: number[] = [];
  let prior = 0;
  events.forEach((event, offset) => {
    sequences.set(event.sequence, [...(sequences.get(event.sequence) ?? []), offset]);
    identities.set(event.eventId, [...(identities.get(event.eventId) ?? []), offset]);
    if (event.sequence <= prior) nonMonotonicAppendOffsets.push(offset);
    prior = event.sequence;
  });
  const sequenceCollisions = [...sequences.entries()].filter(([, offsets]) => offsets.length > 1)
    .map(([sequence, offsets]) => ({
      sequence, offsets,
      eventIds: offsets.map(offset => events[offset].eventId),
      runIds: offsets.map(offset => events[offset].runId ?? null),
    })).sort((a, b) => a.sequence - b.sequence);
  const identityCollisions = [...identities.entries()].filter(([, offsets]) => offsets.length > 1)
    .map(([eventId, offsets]) => ({ eventId, offsets }));
  const proposedStableOrder = events.map((_, offset) => offset)
    .sort((left, right) => events[left].sequence - events[right].sequence || left - right);
  return {
    inputSha256: createHash("sha256").update(bytes).digest("hex"),
    eventCount: events.length,
    sequenceCollisions, identityCollisions, nonMonotonicAppendOffsets,
    proposedStableOrder, remainsUnmodified: true,
  };
}

export function inspectGenesisEventCopy(path: string): GenesisEventDiagnostic {
  if (!path || path.startsWith("-")) throw new Error("Explicit copy filename required");
  // No lock, discovery, snapshot or copy operation: read-only caller-owned input.
  return diagnoseGenesisEventCopy(readFileSync(path));
}
