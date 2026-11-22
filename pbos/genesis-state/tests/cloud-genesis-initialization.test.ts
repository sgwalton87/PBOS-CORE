import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStateStore } from "../json-state-store";

const previous = process.env.PBOS_CLOUD_RUNNER;
afterEach(() => {
  if (previous === undefined) delete process.env.PBOS_CLOUD_RUNNER;
  else process.env.PBOS_CLOUD_RUNNER = previous;
});
describe("cloud Genesis initialization safety", () => {
  it("refuses to invent an empty Genesis when canonical state is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "pbos-genesis-guard-"));
    try {
      process.env.PBOS_CLOUD_RUNNER = "true";
      const store = new JsonStateStore(join(dir, "missing.json"), () => ({ systems: [] }));
      expect(() => store.read()).toThrow("refuses missing canonical Genesis state");
      expect(() => store.update(s => s)).toThrow("refuses missing canonical Genesis state");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("preserves legacy local-only initialization", () => {
    const dir = mkdtempSync(join(tmpdir(), "pbos-local-state-"));
    try {
      delete process.env.PBOS_CLOUD_RUNNER;
      const store = new JsonStateStore(join(dir, "missing.json"), () => ({ systems: [] }));
      expect(store.read()).toEqual({ systems: [] });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
