#!/usr/bin/env node
/**
 * Fail-closed preflight for a future stateful PBOS cloud mission runner.
 * This does not grant execution authority or perform a migration.
 * Usage: node scripts/cloud-runner-state-guard.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const REQUIRED = ["profile.json", "operators.json", "genesis-state.json"];
function inspect(home, options = {}) {
  if (!home || !path.isAbsolute(home)) return { ready: false, reason: "ABSOLUTE_STATE_HOME_REQUIRED" };
  if (options.ephemeral === true) return { ready: false, reason: "EPHEMERAL_RUNNER_FORBIDDEN" };
  const files = {};
  for (const name of REQUIRED) {
    const file = path.join(home, name);
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch {
      return { ready: false, reason: "CANONICAL_STATE_MISSING", missing: name };
    }
    if (!stat.isFile() || stat.isSymbolicLink()) return { ready: false, reason: "UNSAFE_STATE_FILE", file: name };
    if ((stat.mode & 0o077) !== 0) return { ready: false, reason: "STATE_PERMISSIONS_TOO_BROAD", file: name };
    try {
      const bytes = fs.readFileSync(file);
      JSON.parse(bytes.toString("utf8"));
      files[name] = crypto.createHash("sha256").update(bytes).digest("hex");
    } catch {
      return { ready: false, reason: "INVALID_STATE_FILE", file: name };
    }
  }
  // A filesystem lock is NOT a distributed lease; no cloud execution allowed.
  return {
    ready: false,
    reason: "DISTRIBUTED_FENCED_LEASE_AND_AUTHORITY_NOT_VERIFIED",
    fingerprints: files
  };
}
if (require.main === module) {
  const result = inspect(process.env.PBOS_STATE_HOME, {
    ephemeral: process.env.GITHUB_ACTIONS === "true" || process.env.RUNNER_TEMP !== undefined
  });
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode = 2; // Never authorize cloud mission execution from inspection alone.
}
module.exports = { inspect };
