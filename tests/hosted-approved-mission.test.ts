import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { runHostedApprovedMission, HostedExecutionDependencies } from "../pbos/production-runtime/hosted-approved-mission";
import type { ProductionMissionRunner, ProductionMissionRequest } from "../pbos/production-runtime/production-mission-runner";

describe("MB03 hosted execution boundary", () => {
  const keys = generateKeyPairSync("ed25519");
  const pem = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const request = {
    systemId: "test", actorId: "operator-1", repository: "sgwalton87/PBOS-CORE",
    commit: "a".repeat(40), branch: "main", authorizationArtifactId: "signed-approval",
    approvedMissionIds: ["mission-1"], maximumMissions: 1, autonomousContinuation: false,
    buildChannel: { channelId: "channel", systemId: "test", operatingSystemId: "pbos",
      connectorId: "github", repository: "sgwalton87/PBOS-CORE", domainRegistrationIds: ["test"] }
  } as ProductionMissionRequest;
  const payload = () => ({
    schema: "pbos.hosted-mission-approval.v1" as const,
    missionId: "mission-1", repository: request.repository, commit: request.commit,
    operatorId: request.actorId, issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce: randomUUID()
  });
  function approval() {
    const p = payload();
    const data = JSON.stringify([p.schema,p.missionId,p.repository,p.commit,p.operatorId,p.issuedAt,p.expiresAt,p.nonce]);
    return { payload: p, signatureBase64: sign(null, Buffer.from(data), keys.privateKey).toString("base64") };
  }
  function setup() {
    const run = vi.fn(async () => ({ runs: [], stopReason: "NO_ELIGIBLE_MISSION" as const }));
    const runner = { run } as unknown as ProductionMissionRunner;
    const dependencies: HostedExecutionDependencies = {
      trustedPublicKeyPem: pem, canonicalStateVerified: vi.fn(async () => true),
      hostAttested: vi.fn(async () => true),
      acquireFencedLease: vi.fn(async (resource, ownerId) => ({resource,ownerId,fencingToken:1n})),
      assertFencedLease: vi.fn(async () => true), releaseFencedLease: vi.fn(async () => {}),
      recordApprovalNonce: vi.fn(async () => true)
    };
    return {run,runner,dependencies};
  }
  it("admits a signed single mission with a fenced lease", async () => {
    const s = setup();
    await runHostedApprovedMission(s.runner,request,approval(),s.dependencies,() => undefined);
    expect(s.run).toHaveBeenCalledOnce();
    expect(s.dependencies.recordApprovalNonce).toHaveBeenCalledOnce();
    expect(s.dependencies.releaseFencedLease).toHaveBeenCalledOnce();
  });
  it("blocks unverified Genesis and does not acquire a lease", async () => {
    const s = setup();
    const blocked = { ...s.dependencies, canonicalStateVerified: async () => false };
    await expect(runHostedApprovedMission(s.runner,request,approval(),blocked,() => undefined)).rejects.toThrow("Genesis");
    expect(s.run).not.toHaveBeenCalled();
    expect(s.dependencies.acquireFencedLease).not.toHaveBeenCalled();
  });
  it("blocks lease loss and releases the lease", async () => {
    const s = setup();
    const lost = { ...s.dependencies, assertFencedLease: async () => false };
    await expect(runHostedApprovedMission(s.runner,request,approval(),lost,() => undefined)).rejects.toThrow("lease");
    expect(s.run).not.toHaveBeenCalled();
    expect(s.dependencies.releaseFencedLease).toHaveBeenCalledOnce();
  });
  it("blocks replayed approval and continuation", async () => {
    const s = setup();
    const replay = { ...s.dependencies, recordApprovalNonce: async () => false };
    await expect(runHostedApprovedMission(s.runner,request,approval(),replay,() => undefined)).rejects.toThrow("nonce");
    await expect(runHostedApprovedMission(s.runner,{...request,autonomousContinuation:true},approval(),s.dependencies,() => undefined)).rejects.toThrow("one explicitly");
    expect(s.run).not.toHaveBeenCalled();
  });
});
