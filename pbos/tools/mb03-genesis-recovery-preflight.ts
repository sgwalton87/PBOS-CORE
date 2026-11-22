#!/usr/bin/env node
/**
 * MB-03 read-only recovery gate. No Genesis initialization, migration or database writes.
 * Execute before any hosted worker is allowed to acquire a mission lease.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const stateHome = process.env.PBOS_STATE_HOME || join(homedir(), ".pbos");
const file = join(stateHome, "genesis-state.json");
const fail = (reason: string): never => {
  process.stderr.write(JSON.stringify({ gate: "MB03_GENESIS_RECOVERY", status: "BLOCKED", reason }) + "\n");
  process.exit(2);
};
if (!existsSync(file)) fail("CANONICAL_GENESIS_STATE_NOT_FOUND: do not initialize or replace it");
const metadata = statSync(file);
if (!metadata.isFile() || metadata.size === 0) fail("CANONICAL_GENESIS_STATE_EMPTY_OR_NOT_FILE");
if ((metadata.mode & 0o077) !== 0) fail("CANONICAL_GENESIS_STATE_PERMISSIONS_TOO_BROAD");
const bytes = readFileSync(file);
let state: unknown;
try { state = JSON.parse(bytes.toString("utf8")); }
catch { fail("CANONICAL_GENESIS_STATE_INVALID_JSON"); }
if (!state || typeof state !== "object" || Array.isArray(state)) fail("CANONICAL_GENESIS_STATE_INVALID_ROOT");
const digest = createHash("sha256").update(bytes).digest("hex");
process.stdout.write(JSON.stringify({
  gate: "MB03_GENESIS_RECOVERY",
  status: "SOURCE_PRESENT_UNCERTIFIED",
  stateSha256: digest,
  byteLength: bytes.length,
  next: "Verify GenesisStateRepository integrity, operator identity, signed mission approval and lease fencing before worker admission."
}) + "\n");
