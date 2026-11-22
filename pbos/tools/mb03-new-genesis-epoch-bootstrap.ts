#!/usr/bin/env node
/**
 * New Genesis operator epoch bootstrap. Never restores or impersonates the
 * original Genesis authority. Intended for an encrypted persistent host only.
 *
 * PBOS_NEW_EPOCH_APPROVED must be an explicit operator-controlled deployment
 * setting; it is not a signed mission authorization.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, openSync, writeFileSync, closeSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { OperatorIdentityService } from "../genesis-state/operator-identity";

const home = resolve(process.env.PBOS_STATE_HOME ?? join(homedir(), ".pbos"));
const required = ["profile.json", "operators.json", "genesis-state.json"];
const fail = (message: string): never => { process.stderr.write(message + "\n"); process.exit(2); };
if (process.env.PBOS_NEW_EPOCH_APPROVED !== "true") fail("BLOCKED: explicit new-epoch bootstrap authorization missing");
if (process.env.PBOS_EPOCH_ORGANIZATION_ID?.trim() !== "playbook-series-inc") fail("BLOCKED: expected organization not specified");
if (process.env.PBOS_EPOCH_OPERATOR_NAME?.trim() !== "PBOS Cloud Operator") fail("BLOCKED: expected operator name not specified");
if (required.some(file => existsSync(join(home, file)))) fail("BLOCKED: operator state already exists; refusing replacement");
mkdirSync(home, { recursive: true, mode: 0o700 });
const lock = join(home, ".new-epoch-bootstrap.lock");
let fd: number;
try { fd = openSync(lock, "wx", 0o600); } catch { fail("BLOCKED: bootstrap already running"); }
try {
  if (required.some(file => existsSync(join(home, file)))) fail("BLOCKED: operator state appeared during bootstrap");
  const epochId = randomUUID();
  const identity = new OperatorIdentityService(join(home, "operators.json"));
  const enrolled = identity.enroll("playbook-series-inc", "PBOS Cloud Operator");
  // A new epoch starts with no grants, mission runs, approvals or certifications.
  // Persist credentials only on this private encrypted host, never in CI artifacts.
  writeFileSync(join(home, "genesis-state.json"), JSON.stringify({
    systems: [], blueprints: [], sessions: [], grants: [], audit: [{
      eventId: randomUUID(), type: "NEW_GENESIS_EPOCH_BOOTSTRAP",
      actorId: enrolled.operator.operatorId, resource: epochId,
      occurredAt: new Date().toISOString(),
      evidence: { priorAuthority: "UNVERIFIED_NOT_INHERITED", missionExecutionAuthorized: false }
    }]
  }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  writeFileSync(join(home, "profile.json"), JSON.stringify({
    operatorId: enrolled.operator.operatorId,
    organizationId: "playbook-series-inc",
    credential: enrolled.credential
  }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({
    status: "NEW_EPOCH_INITIALIZED_NOT_MISSION_AUTHORIZED",
    epochId, operatorId: enrolled.operator.operatorId,
    next: "Run operator read-only integrity check, configure encrypted durable backup, then obtain new signed mission approval."
  }) + "\n");
} finally {
  closeSync(fd!);
  unlinkSync(lock);
}
