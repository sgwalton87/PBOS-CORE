import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
const script = resolve("pbos/tools/mb03-hosted-admission-observation.ts");
function root(mode = 0o700): string {
  const dir = mkdtempSync(join(tmpdir(), "pbos-hosted-admission-"));
  roots.push(dir);
  chmodSync(dir, mode);
  return dir;
}
function run(stateHome?: string) {
  const env = { ...process.env };
  if (stateHome === undefined) delete env.PBOS_STATE_HOME;
  else env.PBOS_STATE_HOME = stateHome;
  return spawnSync(process.execPath, ["--import", "tsx", script], {
    encoding: "utf8", env, timeout: 15000
  });
}
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});
describe("MB-03 hosted admission fails closed", () => {
  it("rejects an unconfigured state home", () => {
    const result = run();
    expect(result.status).toBe(2);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.status).toBe("BLOCKED");
    expect(receipt.stateDirectorySecure).toBe(false);
    expect(receipt.missionExecutionAuthorized).toBe(false);
  });
  it("rejects group-accessible state directories", () => {
    const result = run(root(0o750));
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).stateDirectorySecure).toBe(false);
  });
  it("rejects symlinked state directories", () => {
    const target = root();
    const parent = root();
    const link = join(parent, "linked");
    symlinkSync(target, link, "dir");
    const result = run(link);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).stateDirectorySecure).toBe(false);
  });
  it("does not authorize a mission merely because the directory is private", () => {
    const result = run(root());
    expect(result.status).toBe(2);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.stateDirectorySecure).toBe(true);
    expect(receipt.canonicalInspection.status).toBe("BLOCKED");
    expect(receipt.missionExecutionAuthorized).toBe(false);
  });
  it("does not disclose a fixture credential in blocked reports", () => {
    const dir = root();
    writeFileSync(join(dir, "profile.json"), '{"credential":"do-not-print-this"}', { mode: 0o600 });
    const result = run(dir);
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("do-not-print-this");
  });
});
