#!/usr/bin/env node
/**
 * Read-only PBOS Genesis recovery inventory for macOS. No Docker or Colima.
 * Never prints file contents, credentials, or private operator records.
 * Run locally: node scripts/find-original-genesis.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const names = ["profile.json", "operators.json", "genesis-state.json"];
const roots = [...new Set([
  process.env.PBOS_STATE_HOME,
  path.join(os.homedir(), ".pbos"),
  path.join(os.homedir(), ".config", "pbos"),
  path.join(os.homedir(), "Documents"),
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "Downloads"),
  path.join(os.homedir(), ".Trash"),
  path.join(os.homedir(), "Library", "Application Support"),
  path.join(os.homedir(), "Library", "CloudStorage")
].filter(Boolean))];
const MAX_DEPTH = 5;
const MAX_ENTRIES = 30000;
let entries = 0;
const matches = [];
function walk(dir, depth) {
  if (depth > MAX_DEPTH || entries >= MAX_ENTRIES) return;
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const item of list) {
    if (++entries >= MAX_ENTRIES) break;
    if (item.isSymbolicLink()) continue;
    const full = path.join(dir, item.name);
    if (item.isFile() && names.includes(item.name)) {
      try {
        const bytes = fs.readFileSync(full);
        JSON.parse(bytes.toString("utf8"));
        matches.push({ path: full, name: item.name, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), size: bytes.length });
      } catch { matches.push({ path: full, name: item.name, status: "unreadable-or-invalid" }); }
    } else if (item.isDirectory() && depth < MAX_DEPTH &&
      !["node_modules", ".git", "Caches", "cache", "Cache", "Trash"].includes(item.name)) walk(full, depth + 1);
  }
}
for (const root of roots) walk(root, 0);
const groups = new Map();
for (const item of matches) {
  const dir = path.dirname(item.path);
  if (!groups.has(dir)) groups.set(dir, []);
  groups.get(dir).push(item);
}
const candidates = [...groups.entries()].map(([directory, files]) => ({
  directory, complete: names.every(n => files.some(f => f.name === n && f.sha256)),
  files
})).sort((a, b) => Number(b.complete) - Number(a.complete));
process.stdout.write(JSON.stringify({
  result: candidates.some(c => c.complete) ? "CANDIDATE_SET_FOUND_VERIFY_AUTHORITY" : "ORIGINAL_STATE_NOT_YET_LOCATED",
  scannedEntries: entries, scanLimitReached: entries >= MAX_ENTRIES,
  candidates, note: "Read-only inventory; no upload, migration, or authority granted."
}, null, 2) + "\n");
