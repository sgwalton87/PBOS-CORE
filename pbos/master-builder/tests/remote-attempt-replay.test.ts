import { describe, expect, it } from "vitest";
import { inspectRemoteAttemptReplay, type RemoteAttemptEvidence } from "../remote-attempt-replay";

const baseline: RemoteAttemptEvidence = {
  missionId: "disposable-mission-1",
  sourceSha: "a".repeat(40),
  approvalDigest: "b".repeat(64),
  attemptId: "attempt-1",
  leaseStatus: "NONE",
  existingAttempts: [],
};

describe("MB-03 read-only remote replay admission", () => {
  it("never grants execution authority even with clear history", () => {
    expect(inspectRemoteAttemptReplay(baseline)).toEqual({
      decision: "ELIGIBLE_FOR_SEPARATE_ATOMIC_LEASE", blockers: [], executionAuthorized: false,
    });
  });
  it("blocks duplicate attempt identity regardless of prior outcome", () => {
    const decision = inspectRemoteAttemptReplay({
      ...baseline,
      existingAttempts: [{ missionId: "another", sourceSha: "c".repeat(40),
        approvalDigest: "d".repeat(64), attemptId: "attempt-1", status: "COMPLETED" }],
    });
    expect(decision.blockers).toContain("ATTEMPT_ID_REPLAY");
    expect(decision.executionAuthorized).toBe(false);
  });
  it.each(["RUNNING", "INTERRUPTED", "COMPLETED", "BLOCKED", "UNKNOWN"] as const)(
    "blocks mission replay after %s even under a different attempt and approval",
    status => {
      const decision = inspectRemoteAttemptReplay({
        ...baseline, attemptId: "attempt-2", approvalDigest: "c".repeat(64),
        existingAttempts: [{ missionId: baseline.missionId, sourceSha: baseline.sourceSha,
          approvalDigest: baseline.approvalDigest, attemptId: "attempt-1", status }],
      });
      expect(decision.blockers).toContain("MISSION_ALREADY_ATTEMPTED");
    },
  );
  it.each(["ACTIVE", "RELEASED", "EXPIRED", "UNKNOWN"] as const)(
    "blocks ambiguous or nonclear lease state %s", leaseStatus => {
      expect(inspectRemoteAttemptReplay({ ...baseline, leaseStatus }).blockers).toContain("LEASE_NOT_CLEAR");
    },
  );
  it("rejects malformed identity and missing history without authorizing execution", () => {
    const decision = inspectRemoteAttemptReplay({
      ...baseline, sourceSha: "latest", approvalDigest: "not-a-digest",
      missionId: " ", attemptId: " ", existingAttempts: undefined as unknown as [],
    });
    expect(decision.blockers).toContain("ATTEMPT_IDENTITY_INVALID");
    expect(decision.blockers).toContain("ATTEMPT_HISTORY_UNKNOWN");
    expect(decision.executionAuthorized).toBe(false);
  });
});
