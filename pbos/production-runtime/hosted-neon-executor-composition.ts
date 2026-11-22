/**
 * Real hosted dependency composition for the existing ProductionMissionRunner.
 * Cloud host MUST inject an authenticated PostgreSQL connection, verified
 * constitutional state, workload identity attestation, and trusted Ed25519 key.
 * No in-memory fallbacks or implicit authority.
 */
import { NeonFencedLeaseProvider, type NeonLeaseSql } from "./neon-fenced-lease-provider";
import { NeonMissionApprovalNonceLedger } from "./neon-mission-approval-nonce-ledger";
import { NeonFencedMissionCheckpoint } from "./neon-fenced-mission-checkpoint";
import type { HostedExecutionDependencies } from "./hosted-approved-mission";

export interface HostedWorkerIdentity {
  readonly trustedPublicKeyPem: string;
  readonly verifyConstitution: () => Promise<boolean>;
  readonly verifyWorkloadIdentity: () => Promise<boolean>;
}
export function composeHostedNeonExecutor(db: NeonLeaseSql, identity: HostedWorkerIdentity) {
  if (!identity.trustedPublicKeyPem.trim()) throw new Error("Hosted worker has no trusted approval verification key.");
  const leases=new NeonFencedLeaseProvider(db,60);
  const nonces=new NeonMissionApprovalNonceLedger(db);
  const checkpoints=new NeonFencedMissionCheckpoint(db);
  const dependencies: HostedExecutionDependencies={
    trustedPublicKeyPem:identity.trustedPublicKeyPem,
    canonicalStateVerified:identity.verifyConstitution,
    hostAttested:identity.verifyWorkloadIdentity,
    acquireFencedLease:(resource,ownerId)=>leases.acquire(resource,ownerId),
    assertFencedLease:lease=>leases.assert(lease),
    renewFencedLease:lease=>leases.renew(lease),
    releaseFencedLease:lease=>leases.release(lease),
    recordApprovalNonce:(nonce,missionId,repository,expiresAt)=>nonces.consume(nonce,missionId,repository,expiresAt)
  };
  return {dependencies,checkpoints,leases};
}
