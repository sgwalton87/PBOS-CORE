import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GenesisStateRepository } from "../pbos/genesis-state";
import { ProductionMissionRunner } from "../pbos/production-runtime/production-mission-runner";
import { ProductionRuntimeService } from "../pbos/production-runtime/production-runtime-service";
import { executeHostedPlaybookMission } from "../pbos/production-runtime/hosted-playbook-mission-executable";
import { hostedMissionScopeDigest } from "../pbos/production-runtime/hosted-signed-mission-approval";
import type { HostedExecutionDependencies } from "../pbos/production-runtime/hosted-approved-mission";
import type { GitHubPrApi } from "../pbos/production-runtime/fenced-playbook-pr-executor";
import type { NeonFencedMissionCheckpoint } from "../pbos/production-runtime/neon-fenced-mission-checkpoint";

describe("hosted Playbook mission executable", () => {
  function fixture() {
    const keys = generateKeyPairSync("ed25519");
    const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-hosted-executable-")), "state.json"));
    const runtime = new ProductionRuntimeService(state);
    const missionId = "mb03-hosted-canary-a";
    const systemId = "PLAYBOOK-SYSTEM-001";
    runtime.reconcileQueue(systemId, [{
      missionId, systemId, title: "Hosted canary A", dependencies: [], status: "QUEUED",
      rationale: "Prove the real hosted runner boundary", approvalRequired: true, evidenceIds: []
    }]);
    const baseSha = "a".repeat(40);
    const content = "# Governed hosted canary A\n";
    const proposal = {
      repository: "sgwalton87/playbook-platform" as const, baseSha, missionId,
      branch: `pbos/mission-${missionId}`, path: `docs/pbos-missions/${missionId}.md`, content,
      title: "PBOS hosted canary A", body: "One bounded, governed disposable mission."
    };
    const scope = {
      branch: proposal.branch, path: proposal.path,
      contentSha256: createHash("sha256").update(content).digest("hex")
    };
    const request = {
      systemId, actorId: "operator-1", authorizationArtifactId: "hosted-signed-approval",
      repository: proposal.repository, branch: "main", commit: baseSha,
      approvedMissionIds: [missionId], maximumMissions: 1, autonomousContinuation: false,
      buildChannel: { channelId: "playbook-hosted", systemId, operatingSystemId: "PBOS",
        connectorId: "github-app", repository: proposal.repository, domainRegistrationIds: ["playbook-test"] }
    };
    const payload = {
      schema: "pbos.hosted-mission-approval.v1" as const, missionId, repository: proposal.repository,
      commit: baseSha, operatorId: request.actorId, scopeDigest: hostedMissionScopeDigest(scope),
      issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nonce: randomUUID()
    };
    const canonical = JSON.stringify([payload.schema,payload.missionId,payload.repository,payload.commit,
      payload.operatorId,payload.scopeDigest,payload.issuedAt,payload.expiresAt,payload.nonce]);
    const approval = { payload, signatureBase64: sign(null, Buffer.from(canonical), keys.privateKey).toString("base64") };
    const admission: HostedExecutionDependencies = {
      trustedPublicKeyPem: keys.publicKey.export({format:"pem",type:"spki"}).toString(),
      canonicalStateVerified: vi.fn(async () => true), hostAttested: vi.fn(async () => true),
      acquireFencedLease: vi.fn(async (resource,ownerId) => ({resource,ownerId,fencingToken:1n})),
      assertFencedLease: vi.fn(async () => true), renewFencedLease: vi.fn(async () => true),
      releaseFencedLease: vi.fn(async () => undefined), recordApprovalNonce: vi.fn(async () => true)
    };
    let branchCreated = false;
    const github: GitHubPrApi = {
      getBranchSha: vi.fn(async (_repo,branch) => branch === "main" ? baseSha : (branchCreated ? "c".repeat(40) : Promise.reject(new Error("GITHUB_BRANCH_NOT_FOUND")))),
      createBranch: vi.fn(async () => { branchCreated = true; }), createFile: vi.fn(async () => undefined),
      createPullRequest: vi.fn(async () => ({url:"https://github.com/sgwalton87/playbook-platform/pull/999",number:999})),
      findPullRequest: vi.fn(async () => null)
    };
    const commit = vi.fn(async (_lease,_mission,_repository,version) => version + 1n);
    const checkpoints = { commit } as unknown as NeonFencedMissionCheckpoint;
    return { state, request, proposal, approval, admission, github, checkpoints, commit,
      runner: new ProductionMissionRunner(state,runtime) };
  }

  it("invokes the real runner and persists two fenced checkpoints around one draft PR", async () => {
    const f = fixture();
    const result = await executeHostedPlaybookMission({request:f.request,approval:f.approval,proposal:f.proposal}, {
      runner:f.runner,admission:f.admission,checkpoints:f.checkpoints,github:f.github,
      sealCheckpoint:async bytes=>bytes
    });
    expect(result.stopReason).toBe("APPROVAL_REQUIRED");
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].status).toBe("AWAITING_APPROVAL");
    expect(result.runs[0].evidenceIds).toHaveLength(7);
    expect(f.commit).toHaveBeenCalledTimes(2);
    expect(f.github.createPullRequest).toHaveBeenCalledOnce();
  });

  it("fails before GitHub mutation when authority or scope is invalid", async () => {
    const f = fixture();
    await expect(executeHostedPlaybookMission({request:f.request,approval:f.approval,proposal:f.proposal}, {
      runner:f.runner,admission:{...f.admission,canonicalStateVerified:async()=>false},checkpoints:f.checkpoints,github:f.github,
      sealCheckpoint:async bytes=>bytes
    })).rejects.toThrow("Genesis");
    expect(f.github.createBranch).not.toHaveBeenCalled();
    const changed = {...f.proposal,content:"different"};
    await expect(executeHostedPlaybookMission({request:f.request,approval:f.approval,proposal:changed}, {
      runner:f.runner,admission:f.admission,checkpoints:f.checkpoints,github:f.github,sealCheckpoint:async bytes=>bytes
    })).rejects.toThrow("signature");
    expect(f.github.createBranch).not.toHaveBeenCalled();
  });
});
