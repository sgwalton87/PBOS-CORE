/**
 * The Master Builder™ — MB-01 pure readiness gate.
 *
 * This module makes no I/O calls, changes no state, and grants no authority.
 * The caller must supply independently verified evidence; this is not a
 * substitute for the Genesis verifier or the approval authority.
 */
export type MasterBuilderEvidence = Readonly<{
  genesisIntegrity: "VALID" | "INVALID" | "UNKNOWN";
  canonEvidence: "COMPLETE" | "BLOCKED" | "UNKNOWN";
  operatorAuthenticated: boolean;
  approvalVerified: boolean;
  approvalScopedToMission: boolean;
  sourceRevisionPinned: boolean;
  isolatedWorktree: boolean;
  syntheticState: boolean;
  existingActiveLease: boolean;
}>;

export type MasterBuilderBlocker =
  | "GENESIS_INVALID"
  | "GENESIS_UNVERIFIED"
  | "CANON_BLOCKED"
  | "CANON_UNVERIFIED"
  | "OPERATOR_UNAUTHENTICATED"
  | "APPROVAL_UNVERIFIED"
  | "APPROVAL_OUT_OF_SCOPE"
  | "SOURCE_REVISION_UNPINNED"
  | "WORKTREE_NOT_ISOLATED"
  | "STATE_NOT_SYNTHETIC"
  | "ACTIVE_LEASE_PRESENT";

export type MasterBuilderReadiness = Readonly<{
  decision: "ELIGIBLE_FOR_SEPARATE_AUTHORIZATION" | "BLOCKED";
  blockers: readonly MasterBuilderBlocker[];
  executionAuthorized: false;
}>;

/** Eligibility is never authorization. Always require the runtime's own gates. */
export function evaluateMasterBuilderReadiness(
  evidence: MasterBuilderEvidence,
): MasterBuilderReadiness {
  const blockers: MasterBuilderBlocker[] = [];
  if (evidence.genesisIntegrity === "INVALID") blockers.push("GENESIS_INVALID");
  if (evidence.genesisIntegrity === "UNKNOWN") blockers.push("GENESIS_UNVERIFIED");
  if (evidence.canonEvidence === "BLOCKED") blockers.push("CANON_BLOCKED");
  if (evidence.canonEvidence === "UNKNOWN") blockers.push("CANON_UNVERIFIED");
  if (!evidence.operatorAuthenticated) blockers.push("OPERATOR_UNAUTHENTICATED");
  if (!evidence.approvalVerified) blockers.push("APPROVAL_UNVERIFIED");
  if (!evidence.approvalScopedToMission) blockers.push("APPROVAL_OUT_OF_SCOPE");
  if (!evidence.sourceRevisionPinned) blockers.push("SOURCE_REVISION_UNPINNED");
  if (!evidence.isolatedWorktree) blockers.push("WORKTREE_NOT_ISOLATED");
  if (!evidence.syntheticState) blockers.push("STATE_NOT_SYNTHETIC");
  if (evidence.existingActiveLease) blockers.push("ACTIVE_LEASE_PRESENT");
  return {
    decision: blockers.length === 0 ? "ELIGIBLE_FOR_SEPARATE_AUTHORIZATION" : "BLOCKED",
    blockers,
    executionAuthorized: false,
  };
}
