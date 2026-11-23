/**
 * MB-03 hosted admission observation only.
 * Reuses the canonical operator/Genesis integrity preflight rather than introducing
 * a second Genesis parser. This does not create state or authorize a mission.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { lstatSync } from "node:fs";
import { inspectExistingOperatorRuntime } from "../production-runtime/operator-readonly-preflight";
import { inspectSealedAdmissionSnapshot } from "../production-runtime/sealed-admission-snapshot";

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
const hosted = process.env.CLOUD_RUN_JOB !== undefined;
const keyPath = process.env.PBOS_OBSERVATION_KEY_FILE;
let configurationBlocker: string | null = directoryBlocker ??
  ((hosted || statePin !== undefined) && !/^[a-f0-9]{64}$/.test(statePin ?? "") ? "STATE_SET_PIN_REQUIRED" : null);
let result: ReturnType<typeof inspectExistingOperatorRuntime> | null = null;
if (configurationBlocker === null) {
  if (!hosted) {
    result = inspectExistingOperatorRuntime(home, statePin);
  } else if (!keyPath || !statePin) {
    configurationBlocker = "SEALED_STATE_KEY_REQUIRED";
  } else {
    try {
      result = inspectSealedAdmissionSnapshot(home, keyPath, statePin);
    } catch {
      configurationBlocker = "SEALED_STATE_VERIFICATION_FAILED";
    }
  }
}
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
