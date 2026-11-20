import { resolve, basename } from "node:path";
import { inspectGenesisEventCopy } from "../genesis-state/historical-event-diagnostic";

/**
 * Usage (operator-supplied *copy*, never a running durable state path):
 * npx tsx pbos/tools/genesis-event-copy-diagnostic.ts --copy /path/to/immutable-genesis-copy.json
 * No output files, writes, replay or secrets.
 */
const argv = process.argv.slice(2);
if (argv.length !== 2 || argv[0] !== "--copy" || !argv[1] ||
  !/(copy|snapshot|backup)/i.test(basename(argv[1]))) {
  process.stderr.write("Usage: --copy <filename containing copy, snapshot or backup>\n");
  process.exitCode = 2;
} else {
  const filename = resolve(argv[1]);
  if (process.env.PBOS_STATE_HOME &&
    filename.startsWith(resolve(process.env.PBOS_STATE_HOME) + "/")) {
    process.stderr.write("Refusing to inspect file inside active PBOS_STATE_HOME. Provide an offline copy.\n");
    process.exitCode = 2;
  } else {
    try {
      const result = inspectGenesisEventCopy(filename);
      // IDs and event payloads are intentionally omitted from console output.
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
      process.stderr.write("Offline copy could not be parsed or validated. No state changed.\n");
      process.exitCode = 2;
    }
  }
}
