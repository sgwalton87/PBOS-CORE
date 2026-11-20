import { describe, expect, it } from "vitest";
import { diagnoseGenesisEventCopy } from "../historical-event-diagnostic";

const encode = (events: unknown[]) => Buffer.from(JSON.stringify({
  productionEvents: events, otherCanonicalHistory: { preserved: true },
}), "utf8");

describe("offline historical Genesis event diagnostic", () => {
  it("detects three historical sequence collisions, preserving every event and byte", () => {
    const data = encode([
      { sequence: 1, eventId: "e1", runId: "a", payload: "first" },
      { sequence: 1, eventId: "e2", runId: "b", payload: "second" },
      { sequence: 2, eventId: "e3", runId: "a" },
      { sequence: 2, eventId: "e4", runId: "b" },
      { sequence: 3, eventId: "e5", runId: "a" },
      { sequence: 3, eventId: "e6", runId: "b" },
    ]);
    const original = Buffer.from(data);
    const report = diagnoseGenesisEventCopy(data);
    expect(report.sequenceCollisions).toHaveLength(3);
    expect(report.identityCollisions).toHaveLength(0);
    expect(report.proposedStableOrder).toEqual([0, 1, 2, 3, 4, 5]);
    expect(report.nonMonotonicAppendOffsets).toEqual([1, 3, 5]);
    expect(data.equals(original)).toBe(true);
    expect(report.remainsUnmodified).toBe(true);
    expect(report.inputSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("does not confuse duplicate identity with duplicate sequence", () => {
    const result = diagnoseGenesisEventCopy(encode([
      { eventId: "same", sequence: 4 }, { eventId: "same", sequence: 7 },
    ]));
    expect(result.identityCollisions).toEqual([{ eventId: "same", offsets: [0, 1] }]);
    expect(result.sequenceCollisions).toEqual([]);
  });
  it("proposes only a stable index order for nonmonotonic copied history", () => {
    const result = diagnoseGenesisEventCopy(encode([
      { eventId: "later", sequence: 9 }, { eventId: "early", sequence: 2 },
      { eventId: "tie", sequence: 2 },
    ]));
    expect(result.proposedStableOrder).toEqual([1, 2, 0]);
    expect(result.nonMonotonicAppendOffsets).toEqual([1, 2]);
  });
  it("fails closed on malformed or missing history", () => {
    expect(() => diagnoseGenesisEventCopy(Buffer.from("{}"))).toThrow("GENESIS_COPY_INVALID");
    expect(() => diagnoseGenesisEventCopy(encode([{ eventId: "e", sequence: 0 }]))).toThrow("GENESIS_COPY_INVALID");
    expect(() => diagnoseGenesisEventCopy(Buffer.from("{"))).toThrow();
  });
});
