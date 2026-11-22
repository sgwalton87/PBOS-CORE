/** MB-03 read-only admission for a remote attempt. Never creates leases or launches a worker. */
export type RemoteAttemptEvidence = Readonly<{
  missionId: string;
  sourceSha: string;
  approvalDigest: string;
  attemptId: string;
  leaseStatus: "NONE" | "ACTIVE" | "RELEASED" | "EXPIRED" | "UNKNOWN";
  existingAttempts: readonly Readonly<{
    missionId: string;
    sourceSha: string;
    approvalDigest: string;
    attemptId: string;
    status: "RUNNING" | "INTERRUPTED" | "COMPLETED" | "BLOCKED" | "UNKNOWN";
  }>[];
}>;

export type RemoteAttemptDecision = Readonly<{
  decision: "ELIGIBLE_FOR_SEPARATE_ATOMIC_LEASE" | "BLOCKED";
  blockers: readonly string[];
  executionAuthorized: false;
}>;

/**
 * A non-authoritative preflight: its green result is NOT a lease claim.
 * The authoritative runtime must atomically claim a lease, recheck approval,
 * and enforce exact SHA before starting any worker.
 */
export function inspectRemoteAttemptReplay(evidence: RemoteAttemptEvidence): RemoteAttemptDecision {
  const blockers: string[] = [];
  if (!evidence.missionId.trim() || !/^[a-f0-9]{40}$/i.test(evidence.sourceSha) ||
      !/^[a-f0-9]{64}$/i.test(evidence.approvalDigest) || !evidence.attemptId.trim()) {
    blockers.push("ATTEMPT_IDENTITY_INVALID");
  }
  if (evidence.leaseStatus !== "NONE") blockers.push("LEASE_NOT_CLEAR");
  if (!Array.isArray(evidence.existingAttempts)) blockers.push("ATTEMPT_HISTORY_UNKNOWN");
  else {
    if (evidence.existingAttempts.some(attempt => attempt.attemptId === evidence.attemptId)) {
      blockers.push("ATTEMPT_ID_REPLAY");
    }
    if (evidence.existingAttempts.some(attempt => attempt.missionId === evidence.missionId)) {
      blockers.push("MISSION_ALREADY_ATTEMPTED");
    }
  }
  return {
    decision: blockers.length === 0 ? "ELIGIBLE_FOR_SEPARATE_ATOMIC_LEASE" : "BLOCKED",
    blockers,
    executionAuthorized: false,
  };
}
