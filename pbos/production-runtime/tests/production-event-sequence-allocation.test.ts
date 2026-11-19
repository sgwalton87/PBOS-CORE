import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import type { ProductionEvent } from "../contracts";

const fixture = () => {
    const path = join(mkdtempSync(join(tmpdir(), "pbos-event-sequence-")), "state.json");
    return { path, first: new GenesisStateRepository(path), second: new GenesisStateRepository(path) };
};

const event = (eventId: string): Omit<ProductionEvent, "sequence"> => ({
    eventId, type: "TEST_EVENT", timestamp: "2026-11-19T00:00:00.000Z",
    runId: "test-run", parentEntityId: "test-run", actorId: "test-operator",
    severity: "INFO", status: "QUEUED", summary: "Isolated test event",
    payload: {}, repository: "sgwalton87/playbook-platform", branch: "test",
    commit: "abcdef0", correlationId: "test-run"
});

describe("PBOS production event sequence allocation", () => {
    it("allocates distinct increasing sequences using the authoritative locked state", () => {
        const { first, second } = fixture();
        first.appendProductionEvent(event("first"));
        second.appendProductionEvent(event("second"));
        first.appendProductionEvent(event("third"));
        const events = first.productionEvents();
        expect(events.map(item => item.eventId)).toEqual(["first", "second", "third"]);
        expect(events.map(item => item.sequence)).toEqual([1, 2, 3]);
    });

    it("does not duplicate an event when an event ID is replayed", () => {
        const { first, second } = fixture();
        first.appendProductionEvent(event("same"));
        second.appendProductionEvent(event("same"));
        second.appendProductionEvent(event("next"));
        expect(first.productionEvents().map(item => item.sequence)).toEqual([1, 2]);
    });

    it("preserves legacy duplicates and appends after the highest existing sequence", () => {
        const { path, first, second } = fixture();
        first.appendProductionEvent(event("a"));
        first.appendProductionEvent(event("b"));
        const state = JSON.parse(readFileSync(path, "utf8"));
        const { writeFileSync } = require("node:fs") as typeof import("node:fs");
        state.productionEvents[1].sequence = 1;
        writeFileSync(path, JSON.stringify(state), "utf8");
        second.appendProductionEvent(event("c"));
        expect(first.productionEvents().map(item => item.sequence)).toEqual([1, 1, 2]);
        expect(first.productionEvents().map(item => item.eventId)).toEqual(["a", "b", "c"]);
    });
});
