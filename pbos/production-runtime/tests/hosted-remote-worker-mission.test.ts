import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { ProductionMissionRunner } from "../production-mission-runner";
import { ProductionRuntimeService } from "../production-runtime-service";
import { executeHostedRemoteWorkerMission } from "../hosted-remote-worker-mission";
import { hostedMissionScopeDigest } from "../hosted-signed-mission-approval";
import type { HostedExecutionDependencies } from "../hosted-approved-mission";
import { evidenceDigest, evidenceJson, evidenceSignatureInput } from "../../master-builder/remote-attestation";
import { RemoteEvidenceArchive } from "../../master-builder/remote-evidence-archive";
import {
    REMOTE_DISPOSAL_DOMAIN, REMOTE_PROVISION_DOMAIN, REMOTE_RETURN_DOMAIN
} from "../../master-builder/trusted-remote-worker";
import type {
    RemoteWorkerBinding, TrustedRemoteWorkerProvider
} from "../../master-builder/trusted-remote-worker";

const temporary: string[] = [];
afterEach(() => {
    for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture() {
    const ed = generateKeyPairSync("ed25519");
    const providerKeys = generateKeyPairSync("ed25519");
    const root = realpathSync(mkdtempSync(join(tmpdir(), "mb03-hosted-remote-")));
    temporary.push(root);
    const archiveRoot = join(root, "archive");
    mkdirSync(archiveRoot, { mode: 0o700 });
    const namespace = "mb03-hosted-remote-fixture";
    const state = GenesisStateRepository.createDisposable(join(root, "state.json"), namespace);
    const runtime = new ProductionRuntimeService(state);
    const missionId = "MB03-MISSION-001";
    const repository = "sgwalton87/playbook-platform";
    const sourceSha = "a".repeat(40);
    const branch = "disposable/mb03-mission-001";
    const path = "docs/pbos-missions/MB03-MISSION-001.md";
    const content = "# Remote canary output\n";
    const scope = {
        branch, path, contentSha256: createHash("sha256").update(content).digest("hex")
    };
    const systemId = "PLAYBOOK-SYSTEM-001";
    runtime.reconcileQueue(systemId, [{
        missionId, systemId, title: "Isolated worker mission", dependencies: [], status: "QUEUED",
        rationale: "Deliver the exact synthetic content", approvalRequired: true, evidenceIds: []
    }]);
    const nonce = randomUUID();
    const payload = {
        schema: "pbos.hosted-mission-approval.v1" as const,
        missionId, repository, commit: sourceSha, operatorId: "operator-1",
        scopeDigest: hostedMissionScopeDigest(scope),
        issuedAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce
    };
    const canonical = JSON.stringify([
        payload.schema, payload.missionId, payload.repository, payload.commit,
        payload.operatorId, payload.scopeDigest, payload.issuedAt, payload.expiresAt, payload.nonce
    ]);
    const approval = {
        payload, signatureBase64: sign(null, Buffer.from(canonical), ed.privateKey).toString("base64")
    };
    const request = {
        systemId, actorId: payload.operatorId, authorizationArtifactId: "hosted-approval:" + nonce,
        repository, branch, commit: sourceSha, approvedMissionIds: [missionId],
        maximumMissions: 1, autonomousContinuation: false,
        buildChannel: {
            channelId: "mb03-remote-fixture", systemId, operatingSystemId: "PBOS", connectorId: "hosted-worker",
            repository, domainRegistrationIds: ["playbook-fixture"]
        }
    };
    const mission = {
        missionId, repository, sourceSha, environment: "DISPOSABLE" as const,
        stateNamespace: namespace, attemptId: nonce, workerId: "hosted-worker-1", allowedPaths: [path]
    };
    const admission: HostedExecutionDependencies = {
        disposableNamespace: namespace,
        trustedPublicKeyPem: ed.publicKey.export({ type: "spki", format: "pem" }).toString(),
        canonicalStateVerified: vi.fn(async () => true),
        hostAttested: vi.fn(async () => true),
        acquireFencedLease: vi.fn(async (resource, ownerId) => ({ resource, ownerId, fencingToken: 1n })),
        assertFencedLease: vi.fn(async () => true),
        renewFencedLease: vi.fn(async () => true),
        releaseFencedLease: vi.fn(async () => undefined),
        recordApprovalNonce: vi.fn(async () => true)
    };
    const signed = <T>(domain: string, object: T) => ({
        payload: object,
        signature: sign(null, evidenceSignatureInput(domain, object), providerKeys.privateKey).toString("hex")
    });
    const provider: TrustedRemoteWorkerProvider = {
        mode: "isolated-remote",
        provision: vi.fn(async (binding: RemoteWorkerBinding) => signed(REMOTE_PROVISION_DOMAIN, {
            providerId: "mb03-signed-provider",
            bindingDigest: evidenceDigest(evidenceJson(binding)),
            sandboxId: "sandbox-fixture-1",
            isolationProfile: "f".repeat(64),
            issuedAt: new Date(Date.now() - 1000).toISOString(),
            expiresAt: binding.deadline,
            credentialExpiresAt: binding.deadline
        })),
        execute: vi.fn(async (binding: RemoteWorkerBinding) => ({
            receipt: signed(REMOTE_RETURN_DOMAIN, {
                providerId: "mb03-signed-provider",
                bindingDigest: evidenceDigest(evidenceJson(binding)),
                sandboxId: "sandbox-fixture-1",
                completedAt: new Date().toISOString(),
                outputsDigest: evidenceDigest(evidenceJson([{ path, digest: evidenceDigest(content) }])),
                status: "SUCCEEDED" as const
            }),
            files: [{ path, contentBase64: Buffer.from(content).toString("base64") }]
        })),
        dispose: vi.fn(async (binding: RemoteWorkerBinding) => signed(REMOTE_DISPOSAL_DOMAIN, {
            providerId: "mb03-signed-provider",
            bindingDigest: evidenceDigest(evidenceJson(binding)),
            sandboxId: "sandbox-fixture-1",
            disposedAt: new Date().toISOString(),
            status: "STOPPED_AND_REVOKED" as const
        }))
    };
    const runner = new ProductionMissionRunner(state, runtime);
    const trust = {
        authorityId: "approved-staging-controller",
        providerId: "mb03-signed-provider",
        publicKey: providerKeys.publicKey,
        isolationProfile: "f".repeat(64),
        archive: new RemoteEvidenceArchive(archiveRoot, 90),
        timeoutMs: 30_000
    };
    const commit = vi.fn(async (_lease, _mission, _repository, version: bigint, _data: Uint8Array) => version + 1n);
    const sealCheckpoint = vi.fn(async (data: Uint8Array) => Buffer.from(data));
    const input = { request, approval, mission, scope };
    const adapters = {
        runner, admission, provider, trust, trustedWorkerId: mission.workerId,
        checkpoints: { commit }, sealCheckpoint
    };
    return { input, adapters, provider, state, admission, commit, sealCheckpoint, content, runner };
}

describe("MB-03 hosted signed remote worker boundary", () => {
    it("dispatches one signed provider job, verifies disposal and pauses for independent review", async () => {
        const f = fixture();
        const result = await executeHostedRemoteWorkerMission(f.input, f.adapters);
        expect(result.stopReason).toBe("INDEPENDENT_VERIFICATION_REQUIRED");
        expect(result.runs).toHaveLength(1);
        expect(result.runs[0].status).toBe("PAUSED");
        expect(f.provider.provision).toHaveBeenCalledOnce();
        expect(f.provider.execute).toHaveBeenCalledOnce();
        expect(f.provider.dispose).toHaveBeenCalledOnce();
        expect(f.commit).toHaveBeenCalledOnce();
        const checkpoint = JSON.parse(Buffer.from(f.sealCheckpoint.mock.calls[0][0]).toString("utf8"));
        expect(checkpoint.contentBase64).toBe(Buffer.from(f.content).toString("base64"));
        expect(checkpoint).not.toHaveProperty("credential");
        expect(f.state.executionLeases().at(-1)?.status).toBe("RELEASED");
        expect(() => f.runner.certify(result.runs[0].runId, "fixture")).toThrow("not awaiting approval");
    });

    it("rejects an untrusted/fixture provider before claiming lease or consuming nonce", async () => {
        const f = fixture();
        await expect(executeHostedRemoteWorkerMission(f.input, {
            ...f.adapters, provider: { ...f.provider, mode: "fixture" }
        })).rejects.toThrow("non-fixture");
        expect(f.admission.acquireFencedLease).not.toHaveBeenCalled();
        expect(f.admission.recordApprovalNonce).not.toHaveBeenCalled();
    });

    it("rejects mismatched worker and source before dispatch", async () => {
        const f = fixture();
        await expect(executeHostedRemoteWorkerMission({
            ...f.input, mission: { ...f.input.mission, workerId: "unreviewed-worker" }
        }, f.adapters)).rejects.toThrow("scope differ");
        expect(f.provider.provision).not.toHaveBeenCalled();
        expect(f.admission.acquireFencedLease).not.toHaveBeenCalled();
    });

    it("rejects Git administrative file scopes before consuming authority", async () => {
        const f = fixture();
        await expect(executeHostedRemoteWorkerMission({
            ...f.input, scope: { ...f.input.scope, path: ".git/config" },
            mission: { ...f.input.mission, allowedPaths: [".git/config"] }
        }, f.adapters)).rejects.toThrow("scope differ");
        expect(f.admission.acquireFencedLease).not.toHaveBeenCalled();
        expect(f.provider.provision).not.toHaveBeenCalled();
    });

    it("requires independently signed provider disposal before persisting any checkpoint", async () => {
        const f = fixture();
        const invalid: TrustedRemoteWorkerProvider = {
            ...f.provider, dispose: vi.fn(async () => undefined)
        };
        await expect(executeHostedRemoteWorkerMission(f.input, {
            ...f.adapters, provider: invalid
        })).rejects.toThrow("disposal");
        expect(f.commit).not.toHaveBeenCalled();
        expect(f.provider.execute).toHaveBeenCalledOnce();
    });

    it("stops before remote execution when durable lease ownership is lost", async () => {
        const f = fixture();
        const losing = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        await expect(executeHostedRemoteWorkerMission(f.input, {
            ...f.adapters, admission: { ...f.admission, assertFencedLease: losing }
        })).rejects.toThrow("lease lost");
        expect(f.provider.provision).toHaveBeenCalledOnce();
        expect(f.provider.execute).not.toHaveBeenCalled();
        expect(f.provider.dispose).toHaveBeenCalledOnce();
        expect(f.commit).not.toHaveBeenCalled();
    });

    it("rejects an invalid hosted approval before remote execution", async () => {
        const f = fixture();
        await expect(executeHostedRemoteWorkerMission({
            ...f.input, scope: { ...f.input.scope, contentSha256: "1".repeat(64) }
        }, f.adapters)).rejects.toThrow("signature");
        expect(f.provider.provision).not.toHaveBeenCalled();
    });

    it("rejects forged provider receipts and retains a blocked run", async () => {
        const f = fixture();
        const original = f.provider.provision;
        const forged: TrustedRemoteWorkerProvider = {
            ...f.provider, provision: async (binding, signal) => {
                const envelope = await original(binding, signal);
                return { ...envelope, signature: "0".repeat(128) };
            }
        };
        await expect(executeHostedRemoteWorkerMission(f.input, {
            ...f.adapters, provider: forged
        })).rejects.toThrow("signature");
        expect(f.provider.execute).not.toHaveBeenCalled();
        expect(f.provider.dispose).toHaveBeenCalledOnce();
        expect(f.commit).not.toHaveBeenCalled();
    });

    it("rejects output bytes different from the approved exact digest", async () => {
        const f = fixture();
        const original = f.provider.execute;
        const altered: TrustedRemoteWorkerProvider = {
            ...f.provider, execute: async (binding, request, signal) => {
                const delivered = await original(binding, request, signal);
                return { ...delivered, files: [{ path: f.input.scope.path,
                    contentBase64: Buffer.from("different output").toString("base64") }] };
            }
        };
        await expect(executeHostedRemoteWorkerMission(f.input, {
            ...f.adapters, provider: altered
        })).rejects.toThrow("exact content");
        expect(f.provider.dispose).toHaveBeenCalledOnce();
        expect(f.commit).not.toHaveBeenCalled();
    });
});
