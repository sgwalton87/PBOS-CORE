#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const cli = join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs");
const entrypoint = join(__dirname, "..", "pbos", "genesis-console", "entrypoint.ts");
const result = spawnSync(process.execPath, [cli, entrypoint, ...process.argv.slice(2)], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
