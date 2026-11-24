#!/usr/bin/env node
/**
 * Read-only MB-03 derivative review for the existing August 2026 Genesis state.
 * Usage: tsx pbos/tools/mb03-review-genesis-derivative.ts ORIGINAL COPY
 * Never signs, uploads, promotes, or rewrites a state file.
 */
import { lstatSync, readFileSync } from "node:fs";
import { auditMb03GenesisDerivative } from "../production-runtime/mb03-genesis-derivative-review";

const ORIGINAL_SHA256 = "64bfc02e56784dab980186daf5589ef3c8ac9b81695583942e282c0b43e7a070";
const HISTORICAL_COLLISIONS = [1715, 2202, 2205] as const;
const MAX_BYTES = 32 * 1024 * 1024;

function readPrivateSnapshot(path: string): Buffer {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() ||
        metadata.size < 1 || metadata.size > MAX_BYTES) {
        throw new Error("MB-03 candidate must be an existing, bounded regular file.");
    }
    return readFileSync(path);
}

try {
    const [originalPath, candidatePath, ...unexpected] = process.argv.slice(2);
    if (!originalPath || !candidatePath || unexpected.length) {
        throw new Error("Supply exactly the original Genesis state and the isolated candidate path.");
    }
    const receipt = auditMb03GenesisDerivative(
        readPrivateSnapshot(originalPath), readPrivateSnapshot(candidatePath),
        ORIGINAL_SHA256, HISTORICAL_COLLISIONS
    );
    if (receipt.eventCount !== 2627 || receipt.runCount !== 38) {
        throw new Error("MB-03 historical state cardinality does not match the reviewed scope.");
    }
    process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
} catch (error) {
    // Never reveal source files, credential bytes, or full state in output.
    process.stderr.write(JSON.stringify({
        gate: "MB03_GENESIS_DERIVATIVE_REVIEW",
        status: "BLOCKED",
        reason: error instanceof Error ? error.message : "Review failed"
    }) + "\n");
    process.exitCode = 2;
}
