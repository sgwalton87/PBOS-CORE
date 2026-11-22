/**
 * MB-03 hosted admission observation only.
 * Reuses the canonical operator/Genesis integrity preflight rather than introducing
 * a second Genesis parser. This does not create state or authorize a mission.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { inspectExistingOperatorRuntime } from "../production-runtime/operator-readonly-preflight";

const home = process.env.PBOS_STATE_HOME ?? join(homedir(), ".pbos");
const result = inspectExistingOperatorRuntime(home);
const eligibleForApprovalReview = result.status === "INSPECTED" &&
  result.operatorAuthenticated && result.integrityValid === true &&
  result.stateFilesUnchanged === true && result.activeRuns === 0 &&
  result.activeLeases === 0;
process.stdout.write(JSON.stringify({
  gate: "MB03_HOSTED_ADMISSION_OBSERVATION",
  status: eligibleForApprovalReview ? "READY_FOR_SEPARATE_SIGNED_APPROVAL" : "BLOCKED",
  canonicalInspection: result,
  missionExecutionAuthorized: false,
  note: "This is not host attestation, migration authorization, signed mission admission or certification."
}) + "\n");
if (!eligibleForApprovalReview) process.exitCode = 2;
