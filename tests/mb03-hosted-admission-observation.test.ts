import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { OperatorIdentityService } from "../pbos/genesis-state";

const roots: string[] = [];
const script = resolve("pbos/tools/mb03-hosted-admission-observation.ts");
function root(mode = 0o700): string {
  const dir = mkdtempSync(join(tmpdir(), "pbos-hosted-admission-"));
  roots.push(dir);
  chmodSync(dir, mode);
  return dir;
}
function run(stateHome?: string, statePin?: string) {
  const env = { ...process.env };
  delete env.CLOUD_RUN_JOB;
  delete env.PBOS_EXPECTED_STATE_SET_SHA256;
  if (statePin !== undefined) {
    env.CLOUD_RUN_JOB = "pbos-genesis-admission";
    env.PBOS_EXPECTED_STATE_SET_SHA256 = statePin;
  }
  if (stateHome === undefined) delete env.PBOS_STATE_HOME;
  else env.PBOS_STATE_HOME = stateHome;
  return spawnSync(process.execPath, ["--import", "tsx", script], {
    encoding: "utf8", env, timeout: 15000
  });
}
function fixture(overrides: Record<string, unknown> = {}, validCredential = true) {
  const dir = root();
  const { operator, credential } = new OperatorIdentityService(join(dir, "operators.json")).enroll("stage", "Fixture");
  writeFileSync(join(dir, "profile.json"), JSON.stringify({ ...operator,
    credential: validCredential ? credential : "wrong-fixture-credential" }), { mode: 0o600 });
  writeFileSync(join(dir, "genesis-state.json"), JSON.stringify({
    systems: [], blueprints: [], sessions: [], grants: [], audit: [], ...overrides
  }), { mode: 0o600 });
  const read = () => ["profile.json", "operators.json", "genesis-state.json"].map(name => readFileSync(join(dir, name)));
  const hashes = read().map(bytes => createHash("sha256").update(bytes).digest("hex"));
  return { dir, read, pin: createHash("sha256").update(hashes.join("\n") + "\n").digest("hex") };
}
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});
describe("MB-03 hosted admission fails closed", () => {
  it("uses Cloud Run Job mount flags without a service-only execution environment option", () => {
    const workflow = readFileSync(resolve(".github/workflows/mb03-deploy-cloud-admission.yml"), "utf8");
    expect(workflow).toContain("--add-volume=name=");
    expect(workflow).toContain("--add-volume-mount=volume=");
    expect(workflow).not.toContain("--execution-environment");
    expect(workflow).toContain("bucket=pbos-genesis-staging-mb03-observation-state");
    expect(workflow).not.toContain("bucket=pbos-genesis-staging-pbos-state");
  });

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
  it("rejects a configured missing directory without creating it", () => {
    const parent = root();
    const result = run(join(parent, "absent"));
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).blocker).toBe("STATE_DIRECTORY_MISSING");
    expect(readdirSync(parent)).toEqual([]);
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
    expect(receipt.blocker).toBe("MISSING_STATE_FILES");
    expect(receipt.missionExecutionAuthorized).toBe(false);
  });
  it.each([["", "STATE_SET_PIN_REQUIRED"], ["0".repeat(64), "STATE_SET_PIN_MISMATCH"]])("checks the snapshot pin %s before authenticating", (wrongPin, blocker) => {
    const { dir } = fixture({}, false);
    const result = run(dir, wrongPin);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).blocker).toBe(blocker);
  });
  it("rejects invalid credentials while keeping every file unchanged", () => {
    const { dir, pin, read } = fixture({}, false);
    const before = read();
    const result = run(dir, pin);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).blocker).toBe("OPERATOR_AUTHENTICATION_FAILED");
    expect(result.stdout).not.toContain("wrong-fixture-credential");
    expect(read()).toEqual(before);
  });
  it.each([
    ["STATE_INTEGRITY_FAILED", { productionEvents: [{ eventId: "orphan", sequence: 1, runId: "missing" }] }],
    ["ACTIVE_RUN", { productionRuns: [{ runId: "active", status: "AWAITING_APPROVAL", validationResults: [] }] }],
    ["ACTIVE_LEASE", { executionLeases: [{ leaseId: "active", runId: "existing", status: "ACTIVE" }] }]
  ])("blocks %s without changing the snapshot", (blocker, overrides) => {
    const { dir, pin, read } = fixture(overrides);
    const before = read();
    const result = run(dir, pin);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ blocker, missionExecutionAuthorized: false });
    expect(read()).toEqual(before);
  });
  it("observes a private read-only snapshot without changing bytes or granting authority", () => {
    const { dir, pin, read } = fixture();
    const before = read();
    for (const name of readdirSync(dir)) chmodSync(join(dir, name), 0o400);
    chmodSync(dir, 0o500);
    try {
      const result = run(dir, pin);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        blocker: null, status: "READY_FOR_SEPARATE_SIGNED_APPROVAL", missionExecutionAuthorized: false,
        canonicalInspection: { operatorAuthenticated: true, integrityValid: true, stateFilesUnchanged: true }
      });
      expect(read()).toEqual(before);
    } finally {
      chmodSync(dir, 0o700);
    }
  });
  it("does not disclose a fixture credential in blocked reports", () => {
    const dir = root();
    writeFileSync(join(dir, "profile.json"), '{"credential":"do-not-print-this"}', { mode: 0o600 });
    const result = run(dir);
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("do-not-print-this");
  });
});
