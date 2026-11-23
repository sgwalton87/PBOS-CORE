/**
 * MB-03 hosted admission observation only.
 * Reuses the canonical operator/Genesis integrity preflight rather than introducing
 * a second Genesis parser. This does not create state or authorize a mission.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { lstatSync } from "node:fs";
import { inspectExistingOperatorRuntime } from "../production-runtime/operator-readonly-preflight";

const home = resolve(process.env.PBOS_STATE_HOME ?? join(homedir(), ".pbos"));
const mountConfigured = process.env.PBOS_STATE_HOME !== undefined;
const directoryBlocker = (() => {
  try {
    if (!mountConfigured) return "STATE_DIRECTORY_UNCONFIGURED";
    const stat = lstatSync(home);
    return stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 &&
      (process.getuid === undefined || stat.uid === process.getuid()) ? null : "STATE_DIRECTORY_UNSAFE";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "STATE_DIRECTORY_MISSING" : "STATE_DIRECTORY_UNREADABLE";
  }
})();
const stateDirectorySecure = directoryBlocker === null;
const statePin = process.env.PBOS_EXPECTED_STATE_SET_SHA256;
const pinRequired = process.env.CLOUD_RUN_JOB !== undefined || statePin !== undefined;
const configurationBlocker = directoryBlocker ??
  (pinRequired && !/^[a-f0-9]{64}$/.test(statePin ?? "") ? "STATE_SET_PIN_REQUIRED" : null);
const result = configurationBlocker === null ? inspectExistingOperatorRuntime(home, statePin) : null;
const eligibleForApprovalReview = result?.status === "INSPECTED" &&
  result.operatorAuthenticated && result.integrityValid === true &&
  result.stateFilesUnchanged === true && result.activeRuns === 0 &&
  result.activeLeases === 0;
process.stdout.write(JSON.stringify({
  gate: "MB03_HOSTED_ADMISSION_OBSERVATION",
  status: eligibleForApprovalReview ? "READY_FOR_SEPARATE_SIGNED_APPROVAL" : "BLOCKED",
  blocker: configurationBlocker ?? result?.blocker ??
    (result?.activeRuns ? "ACTIVE_RUN" : result?.activeLeases ? "ACTIVE_LEASE" : null),
  stateDirectorySecure,
  canonicalInspection: result,
  missionExecutionAuthorized: false,
  nextRequiredControls: eligibleForApprovalReview ? ["SIGNED_MISSION_APPROVAL", "FENCED_EXECUTION_LEASE", "HOST_ATTESTATION"] : ["PRIVATE_DURABLE_STATE_DIRECTORY", "ENCRYPTED_DURABLE_GENESIS_STATE", "OPERATOR_IDENTITY", "INTEGRITY_VERIFICATION"],
  note: "This is not host attestation, migration authorization, signed mission admission or certification."
}) + "\n");
if (!eligibleForApprovalReview) process.exitCode = 2;
