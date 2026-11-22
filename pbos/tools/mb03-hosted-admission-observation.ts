/**
 * MB-03 hosted admission observation only.
 * Reuses the canonical operator/Genesis integrity preflight rather than introducing
 * a second Genesis parser. This does not create state or authorize a mission.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, lstatSync } from "node:fs";
import { inspectExistingOperatorRuntime } from "../production-runtime/operator-readonly-preflight";

const home = resolve(process.env.PBOS_STATE_HOME ?? join(homedir(), ".pbos"));
const mountConfigured = process.env.PBOS_STATE_HOME !== undefined;
const stateDirectorySecure = (() => {
  try {
    if (!mountConfigured || !existsSync(home)) return false;
    const stat = lstatSync(home);
    return stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0;
  } catch {
    return false;
  }
})();
const result = stateDirectorySecure ? inspectExistingOperatorRuntime(home) : null;
const eligibleForApprovalReview = result?.status === "INSPECTED" &&
  result.operatorAuthenticated && result.integrityValid === true &&
  result.stateFilesUnchanged === true && result.activeRuns === 0 &&
  result.activeLeases === 0;
process.stdout.write(JSON.stringify({
  gate: "MB03_HOSTED_ADMISSION_OBSERVATION",
  status: eligibleForApprovalReview ? "READY_FOR_SEPARATE_SIGNED_APPROVAL" : "BLOCKED",
  stateDirectorySecure,
  canonicalInspection: result,
  missionExecutionAuthorized: false,
  nextRequiredControls: eligibleForApprovalReview ? ["SIGNED_MISSION_APPROVAL", "FENCED_EXECUTION_LEASE", "HOST_ATTESTATION"] : ["PRIVATE_DURABLE_STATE_DIRECTORY", "ENCRYPTED_DURABLE_GENESIS_STATE", "OPERATOR_IDENTITY", "INTEGRITY_VERIFICATION"],
  note: "This is not host attestation, migration authorization, signed mission admission or certification."
}) + "\n");
if (!eligibleForApprovalReview) process.exitCode = 2;
