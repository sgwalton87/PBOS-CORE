const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { inspect } = require("./cloud-runner-state-guard.cjs");

test("missing absolute state path blocks cloud mission", () => {
  assert.equal(inspect("").reason, "ABSOLUTE_STATE_HOME_REQUIRED");
  assert.equal(inspect("relative").ready, false);
});
test("ephemeral GitHub runner blocks even if path exists", () => {
  assert.equal(inspect("/tmp/any", { ephemeral: true }).reason, "EPHEMERAL_RUNNER_FORBIDDEN");
});
test("missing original state never initializes a replacement", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pbos-guard-"));
  try {
    assert.equal(inspect(home).reason, "CANONICAL_STATE_MISSING");
    assert.deepEqual(fs.readdirSync(home), []);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
test("even complete isolated files cannot authorize a distributed mission", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pbos-guard-"));
  try {
    for (const name of ["profile.json", "operators.json", "genesis-state.json"])
      fs.writeFileSync(path.join(home, name), "{}", { mode: 0o600 });
    const missingPin = inspect(home);
    assert.equal(missingPin.reason, "CANONICAL_FINGERPRINT_REQUIRED");
    const expected = crypto.createHash("sha256").update("{}").digest("hex");
    assert.equal(inspect(home, { expectedGenesisSha256: "0".repeat(64) }).reason, "CANONICAL_FINGERPRINT_MISMATCH");
    const result = inspect(home, { expectedGenesisSha256: expected });
    assert.equal(result.ready, false);
    assert.equal(result.reason, "DISTRIBUTED_FENCED_LEASE_AND_AUTHORITY_NOT_VERIFIED");
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
