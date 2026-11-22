import type { OperatorPreflightReport } from "../production-runtime/operator-readonly-preflight";
import {
  evaluateMasterBuilderReadiness,
  type MasterBuilderEvidence,
  type MasterBuilderReadiness,
} from "./readiness-gate";

/**
 * Adapt the existing authenticated read-only preflight to MB-01.
 * Deliberately NEVER infer Canon readiness, approvals, worktree isolation,
 * or synthetic-state identity from a healthy operator runtime.
 */
export type ExternalMissionEvidence = Readonly<Pick<MasterBuilderEvidence,
  "canonEvidence" | "approvalVerified" | "approvalScopedToMission" |
  "sourceRevisionPinned" | "isolatedWorktree" | "syntheticState"
>>;

export function evaluateOperatorMissionReadiness(
  preflight: OperatorPreflightReport,
  external: ExternalMissionEvidence,
): MasterBuilderReadiness {
  const genesisIntegrity: MasterBuilderEvidence["genesisIntegrity"] =
    preflight.integrityValid === true &&
    preflight.status === "INSPECTED" &&
    preflight.stateFilesUnchanged === true
      ? "VALID"
      : preflight.integrityValid === false
        ? "INVALID"
        : "UNKNOWN";

  // Missing lease evidence fails closed; an INSPECTED result is not permission.
  const existingActiveLease =
    preflight.activeLeases === null || preflight.activeLeases > 0 ||
    preflight.activeRuns === null || preflight.activeRuns > 0;

  return evaluateMasterBuilderReadiness({
    ...external,
    genesisIntegrity,
    operatorAuthenticated: preflight.operatorAuthenticated &&
      preflight.status === "INSPECTED",
    existingActiveLease,
  });
}
