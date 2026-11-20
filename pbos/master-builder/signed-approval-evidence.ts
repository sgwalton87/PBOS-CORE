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
