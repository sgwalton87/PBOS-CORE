import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { NeonDisposableGenesisState } from "../production-runtime/neon-disposable-genesis-state";
import { NeonFencedLeaseProvider, type NeonLeaseSql } from "../production-runtime/neon-fenced-lease-provider";

const mode = process.argv[2];
const databaseUrl = process.env.PBOS_STAGE3_DATABASE_URL;
const namespace = process.env.PBOS_STAGE3_NAMESPACE;
const sourcePin = process.env.PBOS_STAGE3_SOURCE_PIN;
const authorityId = process.env.PBOS_STAGE3_AUTHORITY_ID;
const stateFile = process.env.PBOS_STAGE3_CHECKPOINT_FILE;
if (!databaseUrl || !namespace || !sourcePin || !authorityId || !stateFile || !["init", "resume"].includes(mode)) {
  throw new Error("Stage 3 requires mode, database URL, namespace, source pin, authority, and checkpoint path.");
}
const dbUrl = databaseUrl as string;
const ns = namespace as string;
const pin = sourcePin as string;
const authority = authorityId as string;
const checkpointPath = stateFile as string;
const phase = mode as "init" | "resume";
if (!/^mb03-stage3-[A-Za-z0-9._-]+$/.test(ns)) throw new Error("Invalid synthetic namespace.");
async function main(): Promise<void> {
  const sql = neon(dbUrl);
  const db: NeonLeaseSql = { async query<T extends Record<string, unknown>>(query: string, params: readonly unknown[]) {
    const result = await sql.query(query, [...params]);
    return { rows: result as T[] };
  } };
  const state = new NeonDisposableGenesisState(db, ns);
  const leases = new NeonFencedLeaseProvider(db, 60);
  const resource = `pbos:stage3:${ns}`;
  if (phase === "init") {
    await state.initialize(pin, authority);
    const lease = await leases.acquire(resource, randomUUID());
    if (!lease) throw new Error("Unable to acquire synthetic Stage 3 lease.");
    try {
      const sequence = await state.append({ eventId: randomUUID(), eventType: "PROCESS_ONE_COMMITTED", actorId: "mb03-stage3-test", payload: { mode }, leaseResource: resource, fencingToken: lease.fencingToken }, 0n);
      if (sequence !== 1n) throw new Error(`Expected sequence 1, received ${sequence}`);
    } finally { await leases.release(lease); }
    writeFileSync(checkpointPath, JSON.stringify({ namespace: ns, sourcePin: pin, authorityId: authority, resource }), { mode: 0o600 });
    process.stdout.write("stage3 process 1 committed and exited\n");
    return;
  }
  const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8")) as { namespace: string; sourcePin: string; authorityId: string; resource: string };
  if (checkpoint.namespace !== ns || checkpoint.sourcePin !== pin || checkpoint.authorityId !== authority || checkpoint.resource !== resource) throw new Error("Stage 3 checkpoint binding mismatch.");
  if (!(await state.matchesBinding(pin, authority))) throw new Error("Durable namespace binding is missing or changed.");
  const lease = await leases.acquire(resource, randomUUID());
  if (!lease) throw new Error("Unable to reacquire synthetic Stage 3 lease.");
  try {
    const sequence = await state.append({ eventId: randomUUID(), eventType: "PROCESS_TWO_RECOVERED", actorId: "mb03-stage3-test", payload: { mode }, leaseResource: resource, fencingToken: lease.fencingToken }, 1n);
    // The append function is SECURITY DEFINER and returns the atomically committed
    // sequence. Do not read the table directly: the staging role intentionally has
    // no table SELECT grant. Sequence 2 proves process one persisted and process two
    // recovered against the same fenced namespace after the process boundary.
    if (sequence !== 2n) throw new Error(`Expected recovered durable sequence 2, received ${sequence}`);
  } finally { await leases.release(lease); }
  process.stdout.write("stage3 process 2 recovered durable state\n");
}
void main();
