import { evaluateMasterBuilderReadiness, type MasterBuilderEvidence, type MasterBuilderReadiness } from "./readiness-gate";

/** Untrusted strings are never proof that an approval was issued or signed. */
export type MasterBuilderMissionBinding = Readonly<{
  missionId: string;
  repository: string;
  sourceSha: string;
  stateNamespace: string;
  environment: "DISPOSABLE" | "STAGING" | "PRODUCTION";
}>;

export type VerifiedMissionAuthorization = Readonly<{
  missionId: string;
  repository: string;
  sourceSha: string;
  stateNamespace: string;
  expiresAt: string;
  verifiedByAuthority: boolean;
}>;

export type MissionBindingDecision = Readonly<{
  readiness: MasterBuilderReadiness;
  binding: "MATCHED" | "BLOCKED";
  bindingBlockers: readonly string[];
  executionAuthorized: false;
}>;

/**
 * An additional, read-only binding check. The approval must have already been
 * verified by the authoritative approval subsystem. This function cannot
 * authenticate a signature or grant execution authority.
 */
export function evaluateMasterBuilderMissionBinding(
  evidence: MasterBuilderEvidence,
  mission: MasterBuilderMissionBinding,
  approval: VerifiedMissionAuthorization | null,
  now: Date,
): MissionBindingDecision {
  const readiness = evaluateMasterBuilderReadiness(evidence);
  const blockers: string[] = [];
  if (mission.environment !== "DISPOSABLE") blockers.push("ENVIRONMENT_NOT_DISPOSABLE");
  if (!mission.missionId.trim() || !mission.repository.trim() ||
      !mission.stateNamespace.trim() || !/^[a-f0-9]{40}$/i.test(mission.sourceSha)) {
    blockers.push("MISSION_IDENTITY_INVALID");
  }
  if (!approval?.verifiedByAuthority) blockers.push("AUTHORITY_VERIFICATION_MISSING");
  if (approval && (approval.missionId !== mission.missionId ||
      approval.repository !== mission.repository ||
      approval.sourceSha !== mission.sourceSha ||
      approval.stateNamespace !== mission.stateNamespace)) {
    blockers.push("APPROVAL_MISSION_MISMATCH");
  }
  if (!approval || !Number.isFinite(Date.parse(approval.expiresAt)) ||
      !Number.isFinite(now.getTime()) || Date.parse(approval.expiresAt) <= now.getTime()) {
    blockers.push("APPROVAL_EXPIRED_OR_INVALID");
  }
  return {
    readiness,
    binding: readiness.decision === "ELIGIBLE_FOR_SEPARATE_AUTHORIZATION" &&
      blockers.length === 0 ? "MATCHED" : "BLOCKED",
    bindingBlockers: blockers,
    executionAuthorized: false,
  };
}
