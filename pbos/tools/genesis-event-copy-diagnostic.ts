import { lstatSync, realpathSync, statSync } from "node:fs";
import { resolve, basename, relative, isAbsolute } from "node:path";
import { inspectGenesisEventCopy } from "../genesis-state/historical-event-diagnostic";

/**
 * Reads an operator-supplied offline copy, never an active Genesis state file.
 * npx tsx pbos/tools/genesis-event-copy-diagnostic.ts --copy /path/to/immutable-genesis-copy.json
 * Never writes, repairs, replays or accesses network services.
 */
function isWithin(parent: string, child: string): boolean {
  const rest = relative(parent, child);
  return rest === "" || (!rest.startsWith("..") && !isAbsolute(rest));
}

function validateOfflineCopy(input: string): string {
  if (!input || input.startsWith("-") || !/(copy|snapshot|backup)/i.test(basename(input))) {
    throw new Error("Explicitly named offline copy required");
  }
  const requested = resolve(input);
  if (lstatSync(requested).isSymbolicLink()) throw new Error("Symlinked copy refused");
  const file = realpathSync(requested);
  const metadata = statSync(file);
  if (!metadata.isFile() || metadata.size > 64 * 1024 * 1024) {
    throw new Error("Expected a regular offline JSON copy under 64 MiB");
  }
  const stateHome = process.env.PBOS_STATE_HOME;
  if (stateHome && isWithin(realpathSync(stateHome), file)) {
    throw new Error("Active PBOS_STATE_HOME contents are forbidden");
  }
  return file;
}

const argv = process.argv.slice(2);
if (argv.length !== 2 || argv[0] !== "--copy") {
  process.stderr.write("Usage: --copy <offline-copy-or-snapshot.json>\n");
  process.exitCode = 2;
} else {
  try {
    const result = inspectGenesisEventCopy(validateOfflineCopy(argv[1]));
    // Only aggregate counts and offsets appear; no payloads, event IDs or credentials.
    process.stdout.write(JSON.stringify({
      source_sha256: result.inputSha256,
      event_count: result.eventCount,
      sequence_collision_count: result.sequenceCollisions.length,
      sequence_collision_offsets: result.sequenceCollisions.map(item => item.offsets),
      identity_collision_count: result.identityCollisions.length,
      nonmonotonic_append_offsets: result.nonMonotonicAppendOffsets,
      mutation: "NONE",
      recovery_authorized: false,
    }, null, 2) + "\n");
    if (result.sequenceCollisions.length || result.identityCollisions.length) process.exitCode = 3;
  } catch {
    process.stderr.write("Offline copy refused, missing or invalid. No state changed.\n");
    process.exitCode = 2;
  }
}
