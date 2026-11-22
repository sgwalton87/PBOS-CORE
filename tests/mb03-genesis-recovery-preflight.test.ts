import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
const script = resolve("pbos/tools/mb03-genesis-recovery-preflight.ts");
function fixture(value?: string, mode = 0o600) {
  const root = mkdtempSync(join(tmpdir(), "pbos-mb03-gate-"));
  roots.push(root);
  if (value !== undefined) {
    writeFileSync(join(root, "genesis-state.json"), value, { mode });
    chmodSync(join(root, "genesis-state.json"), mode);
  }
  return root;
}
function run(root: string) {
  return spawnSync(process.execPath, ["--import", "tsx", script], {
    encoding: "utf8", env: { ...process.env, PBOS_STATE_HOME: root },
    timeout: 15000
  });
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe("MB-03 canonical state preflight", () => {
  it("fails closed when Genesis is absent", () => {
    const result = run(fixture());
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("CANONICAL_GENESIS_STATE_NOT_FOUND");
  });
  it("rejects empty and malformed Genesis", () => {
    for (const value of ["", "{", "[]", "null"]) {
      const result = run(fixture(value));
      expect(result.status).toBe(2);
    }
  });
  it("rejects group-readable Genesis", () => {
    const result = run(fixture('{"version":1}', 0o640));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("PERMISSIONS_TOO_BROAD");
  });
  it("reports a fingerprint without printing state or granting authority", () => {
    const secret = '{"fixture":"never-print-this"}';
    const result = run(fixture(secret));
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.status).toBe("SOURCE_PRESENT_UNCERTIFIED");
    expect(receipt.stateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.stdout).not.toContain("never-print-this");
    expect(result.stdout).not.toContain("AUTHORIZED");
  });
});
