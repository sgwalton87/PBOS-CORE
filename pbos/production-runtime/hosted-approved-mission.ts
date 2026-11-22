/**
 * MB03 hosted execution boundary for the existing ProductionMissionRunner.
 * Deliberately injects persistent storage, attestation, and fenced lease providers;
 * never falls back to local JSON or an in-memory lease in hosted execution.
 */
import { randomUUID } from "node:crypto";
import { ProductionMissionRunner, ProductionMissionRequest, ProductionMissionExecutor, ProductionMissionSequence } from "./production-mission-runner";
import { MissionQueueItem } from "./contracts";
import { SignedHostedMissionApproval, verifyHostedMissionApproval } from "./hosted-signed-mission-approval";

export interface HostedExecutionLease {
  readonly resource: string;
  readonly ownerId: string;
  readonly fencingToken: bigint;
}
export interface HostedExecutionDependencies {
  readonly trustedPublicKeyPem: string;
  readonly canonicalStateVerified: () => Promise<boolean>;
  readonly hostAttested: () => Promise<boolean>;
  readonly acquireFencedLease: (resource: string, ownerId: string) => Promise<HostedExecutionLease | null>;
  readonly assertFencedLease: (lease: HostedExecutionLease) => Promise<boolean>;
  readonly releaseFencedLease: (lease: HostedExecutionLease) => Promise<void>;
  readonly recordApprovalNonce: (nonce: string, expiresAt: string) => Promise<boolean>;
}
export async function runHostedApprovedMission(
  runner: ProductionMissionRunner,
  request: ProductionMissionRequest,
  approval: SignedHostedMissionApproval,
  dependencies: HostedExecutionDependencies,
  executorFor: (mission: MissionQueueItem) => ProductionMissionExecutor | undefined
): Promise<ProductionMissionSequence> {
  if (request.autonomousContinuation !== false || request.maximumMissions !== 1 ||
      request.approvedMissionIds?.length !== 1 ||
      request.approvedMissionIds[0] !== approval.payload.missionId) {
    throw new Error("Hosted admission requires one explicitly approved mission and no autonomous continuation.");
  }
  if (!verifyHostedMissionApproval(approval, {
    missionId: request.approvedMissionIds[0], repository: request.repository,
    commit: request.commit, operatorId: request.actorId
  }, dependencies.trustedPublicKeyPem)) throw new Error("Hosted mission signature or lineage invalid.");
  if (!(await dependencies.canonicalStateVerified())) throw new Error("Canonical Genesis state is not verified.");
  if (!(await dependencies.hostAttested())) throw new Error("Hosted execution identity is not attested.");
  const resource = `pbos:mission:${request.repository}:${request.approvedMissionIds[0]}`;
  const lease = await dependencies.acquireFencedLease(resource, randomUUID());
  if (!lease || lease.resource !== resource || lease.fencingToken < 1n) {
    throw new Error("Durable fenced execution lease unavailable.");
  }
  try {
    if (!(await dependencies.assertFencedLease(lease))) throw new Error("Fenced lease ownership lost.");
    // Nonce persistence MUST be atomic/unique on the durable host. A false result
    // means replay or storage failure. No mission starts before this succeeds.
    if (!(await dependencies.recordApprovalNonce(approval.payload.nonce, approval.payload.expiresAt))) {
      throw new Error("Mission approval nonce already consumed or cannot be persisted.");
    }
    return await runner.run(request, mission => {
      const executor = executorFor(mission);
      if (!executor || mission.missionId !== approval.payload.missionId) return undefined;
      return async context => {
        if (!(await dependencies.assertFencedLease(lease))) throw new Error("Fenced lease ownership lost before mission execution.");
        return executor(context);
      };
    });
  } finally {
    await dependencies.releaseFencedLease(lease);
  }
}
