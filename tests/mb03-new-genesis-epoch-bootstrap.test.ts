import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const homes: string[] = [];
const home = () => { const p = mkdtempSync(join(tmpdir(), "mb03-new-epoch-")); homes.push(p); return p; };
const run = (dir: string, approved = "true") => spawnSync(process.execPath, [
  "node_modules/tsx/dist/cli.mjs", "pbos/tools/mb03-new-genesis-epoch-bootstrap.ts"
], { cwd: process.cwd(), encoding: "utf8", env: {
  ...process.env, PBOS_STATE_HOME: dir, PBOS_NEW_EPOCH_APPROVED: approved,
  PBOS_EPOCH_ORGANIZATION_ID: "playbook-series-inc",
  PBOS_EPOCH_OPERATOR_NAME: "PBOS Cloud Operator"
} });
afterEach(() => { for (const p of homes.splice(0)) rmSync(p, { recursive: true, force: true }); });

describe("MB-03 new Genesis epoch bootstrap", () => {
  it("fails closed without explicit bootstrap authorization", () => {
    const dir = home();
    expect(run(dir, "false").status).toBe(2);
    expect(existsSync(join(dir, "operators.json"))).toBe(false);
  });
  it("never overwrites an existing Genesis state", () => {
    const dir = home();
    writeFileSync(join(dir, "genesis-state.json"), '{"original":true}');
    expect(run(dir).status).toBe(2);
    expect(readFileSync(join(dir, "genesis-state.json"), "utf8")).toBe('{"original":true}');
  });
  it("creates an isolated epoch without inherited grants and blocks repeat bootstrap", () => {
    const dir = home();
    const first = run(dir);
    expect(first.status).toBe(0);
    const result = JSON.parse(first.stdout);
    expect(result.status).toBe("NEW_EPOCH_INITIALIZED_NOT_MISSION_AUTHORIZED");
    const genesis = JSON.parse(readFileSync(join(dir, "genesis-state.json"), "utf8"));
    expect(genesis.grants).toEqual([]);
    expect(genesis.audit[0].evidence.missionExecutionAuthorized).toBe(false);
    const profile = JSON.parse(readFileSync(join(dir, "profile.json"), "utf8"));
    expect(profile.credential.length).toBeGreaterThanOrEqual(16);
    expect(first.stdout).not.toContain(profile.credential);
    expect(run(dir).status).toBe(2);
  });
});
