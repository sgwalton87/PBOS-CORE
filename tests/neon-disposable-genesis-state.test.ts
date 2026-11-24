import { describe, expect, it, vi } from "vitest";
import { NeonDisposableGenesisState } from "../pbos/production-runtime/neon-disposable-genesis-state";

describe("NeonDisposableGenesisState", () => {
  it("binds initialization to the exact reviewed source pin and authority", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ initialized: true }] }) };
    const state = new NeonDisposableGenesisState(db, "mb03-stage3");
    await state.initialize("2f48068fc89fd278cf4f932ac4ea3cd9ec4e9e2990a330cf78d7551b33ccb47d", "11111111-1111-4111-8111-111111111111");
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("initialize_mb03_disposable_namespace"), expect.any(Array));
  });

  it("rejects lineage and namespace errors before database access", async () => {
    const db = { query: vi.fn() };
    const state = new NeonDisposableGenesisState(db, "mb03-stage3");
    await expect(state.initialize("wrong", "not-an-authority")).rejects.toThrow("lineage");
    expect(db.query).not.toHaveBeenCalled();
  });

  it("appends an event with the expected sequence and fence", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ sequence: "1" }] }) };
    const state = new NeonDisposableGenesisState(db, "mb03-stage3");
    await expect(state.append({ eventId: "11111111-1111-4111-8111-111111111111", eventType: "MISSION_ADMITTED", actorId: "operator", payload: { mission: "m1" }, fencingToken: 4n }, 0n)).resolves.toBe(1n);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("append_mb03_disposable_event"), expect.arrayContaining(["4", "0"]));
  });

  it("rejects invalid event identity and stale sequence locally", async () => {
    const db = { query: vi.fn() };
    const state = new NeonDisposableGenesisState(db, "mb03-stage3");
    await expect(state.append({ eventId: "bad", eventType: "x", actorId: "a", payload: {}, fencingToken: 1n }, 0n)).rejects.toThrow("event");
    await expect(state.append({ eventId: "11111111-1111-4111-8111-111111111111", eventType: "x", actorId: "a", payload: {}, fencingToken: 1n }, -1n)).rejects.toThrow("event");
    expect(db.query).not.toHaveBeenCalled();
  });
});
