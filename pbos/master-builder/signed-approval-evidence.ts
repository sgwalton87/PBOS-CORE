import type { VerifiableApproval } from "../genesis-state/operator-identity";
import type { VerifiedMissionAuthorization, MasterBuilderMissionBinding } from "./mission-binding-gate";

/**
 * Uses the existing OperatorIdentityService.verify contract. No signing keys,
 * approval issuance, state writes, or new approval service.
 */
export type ExistingApprovalVerifier = Readonly<{
  verify: (approval: VerifiableApproval, action: string, resource: string, at: Date) => boolean;
}>;

export type SignedMissionApprovalContext = Readonly<{
  action: string;
  resource: string;
  mission: MasterBuilderMissionBinding;
}>;

/**
 * Returns a fail-closed binding result. Verification errors are not authority.
 * The action/resource must be supplied by the existing runtime's approved
 * contract; this adapter does not invent a new approval scope.
 */
export function inspectSignedMissionApproval(
  verifier: ExistingApprovalVerifier,
  approval: VerifiableApproval | null,
  context: SignedMissionApprovalContext,
  now: Date,
): VerifiedMissionAuthorization | null {
  if (!approval || !Number.isFinite(now.getTime()) ||
      !context.action.trim() || !context.resource.trim() ||
      context.mission.environment !== "DISPOSABLE") return null;
  let verified = false;
  try {
    verified = verifier.verify(approval, context.action, context.resource, now);
  } catch {
    return null;
  }
  if (!verified) return null;
  return {
    missionId: context.mission.missionId,
    repository: context.mission.repository,
    sourceSha: context.mission.sourceSha,
    stateNamespace: context.mission.stateNamespace,
    expiresAt: approval.expiresAt,
    verifiedByAuthority: true,
  };
}

/**
 * Canonical mission scope for use with the existing operator approval service.
 * Callers must sign THIS exact action/resource through OperatorIdentityService,
 * then verify through inspectSignedMissionApproval. No wildcard scope.
 */
export const MASTER_BUILDER_DISPOSABLE_ACTION = "master-builder:disposable-mission" as const;

export function disposableMissionApprovalScope(mission: MasterBuilderMissionBinding):
  Readonly<{ action: typeof MASTER_BUILDER_DISPOSABLE_ACTION; resource: string }> {
  if (mission.environment !== "DISPOSABLE" ||
      !/^[a-f0-9]{40}$/i.test(mission.sourceSha) ||
      !/^[A-Za-z0-9._/-]+$/.test(mission.repository) ||
      !/^[A-Za-z0-9._-]+$/.test(mission.missionId) ||
      !/^[A-Za-z0-9._-]+$/.test(mission.stateNamespace)) {
    throw new Error("Disposable mission approval scope requires exact validated mission identity.");
  }
  return {
    action: MASTER_BUILDER_DISPOSABLE_ACTION,
    resource: JSON.stringify([
      mission.missionId, mission.repository, mission.sourceSha.toLowerCase(), mission.stateNamespace,
    ]),
  };
}

export function inspectScopedDisposableMissionApproval(
  verifier: ExistingApprovalVerifier,
  approval: VerifiableApproval | null,
  mission: MasterBuilderMissionBinding,
  now: Date,
): VerifiedMissionAuthorization | null {
  let scope: ReturnType<typeof disposableMissionApprovalScope>;
  try { scope = disposableMissionApprovalScope(mission); }
  catch { return null; }
  return inspectSignedMissionApproval(verifier, approval, { ...scope, mission }, now);
}
