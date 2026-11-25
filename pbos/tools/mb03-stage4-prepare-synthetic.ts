/** Prepare or inspect a synthetic-only host-bound state file. Never creates signed or queued authority. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { GenesisStateRepository } from "../genesis-state";

const NAMESPACE = /^mb03-[A-Za-z0-9._-]+$/;
const ID = /^[a-f0-9-]{36}$/;
type SyntheticState = {
  disposableNamespace?: string;
  disposableAuthorityId?: string;
  missionQueue?: unknown[];
  productionRuns?: unknown[];
  executionLeases?: unknown[];
  grants?: unknown[];
  sessions?: unknown[];
  audit?: unknown[];
  systems?: unknown[];
};

function assertPrivateHostBoundState(path: string, namespace: string) {
  const full = resolve(path), parent = dirname(full);
  const parentMeta = lstatSync(parent), fileMeta = lstatSync(full);
  if (realpathSync(parent) !== parent || !parentMeta.isDirectory() || (parentMeta.mode & 0o077) !== 0 ||
      realpathSync(full) !== full || !fileMeta.isFile() || (fileMeta.mode & 0o077) !== 0 ||
      (process.getuid !== undefined && (parentMeta.uid !== process.getuid() || fileMeta.uid !== process.getuid()))) {
    throw Error("Synthetic state path is not private and host-bound.");
  }
  const bytes = readFileSync(full);
  const data = JSON.parse(bytes.toString("utf8")) as SyntheticState;
  if (data.disposableNamespace !== namespace || !ID.test(data.disposableAuthorityId ?? "") ||
      [data.missionQueue, data.productionRuns, data.executionLeases, data.grants,
        data.sessions, data.audit, data.systems].some(items => items !== undefined && (!Array.isArray(items) || items.length !== 0))) {
    throw Error("Synthetic preparation refuses any mission, grant, lease, history or application state.");
  }
  // The repository verifies placement, namespace, private file and authority against current host/path.
  const repository = new GenesisStateRepository(full, namespace);
  repository.assertDisposableAuthority(data.disposableAuthorityId!);
  return { status: "SYNTHETIC_ONLY_STATE_PREPARED", namespace,
    authorityId: data.disposableAuthorityId, sha256: createHash("sha256").update(bytes).digest("hex"),
    originalGenesisUntouched: true, missionExecutionAuthorized: false,
    warning: "Host/path bound test state only; not a signed mission envelope or deployable Cloud Run state." };
}

export function prepareSyntheticOnlyState(path: string, namespace: string, confirmation: string,
  mode: "create" | "inspect" = "create") {
  if (confirmation !== "STAGE4-SYNTHETIC-ONLY" || !NAMESPACE.test(namespace)) {
    throw Error("Explicit synthetic-only scope and MB03 namespace are required.");
  }
  if (mode === "create") GenesisStateRepository.createDisposable(resolve(path), namespace);
  else if (mode !== "inspect") throw Error("Unsupported synthetic state operation.");
  return assertPrivateHostBoundState(path, namespace);
}

if (require.main === module) {
  const [mode, path, namespace, confirmation] = process.argv.slice(2);
  if ((mode !== "create" && mode !== "inspect") || !path || !namespace || !confirmation) {
    process.stderr.write("Usage: tsx mb03-stage4-prepare-synthetic.ts create|inspect <new-or-existing-private-state-file> <mb03-namespace> STAGE4-SYNTHETIC-ONLY\n");
    process.exitCode = 2;
  } else {
    try { process.stdout.write(JSON.stringify(prepareSyntheticOnlyState(path, namespace, confirmation, mode)) + "\n"); }
    catch { process.stderr.write("Stage 4 synthetic state preparation BLOCKED; no missions were authorized.\n"); process.exitCode = 2; }
  }
}
