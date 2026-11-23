import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sandbox } from "@vercel/sandbox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { ProductionRuntimeService } from "../production-runtime-service";
import { ProductionMissionRunner } from "../production-mission-runner";
import {
    executeHostedPlaybookCodexMission, prepareHostedPlaybookCodexMission
} from "../hosted-playbook-codex-composition";
import { hostedMissionScopeDigest } from "../hosted-signed-mission-approval";
import { VercelPlaybookProvider } from "../../master-builder/vercel-remote-provider";
import { createRemotePlaybookMission, playbookRemotePath } from "../../master-builder/playbook-remote-mission";
import type { PlaybookMb03MissionId } from "../../master-builder/playbook-remote-mission";
import { RemoteEvidenceArchive } from "../../master-builder/remote-evidence-archive";
import type { HostedExecutionDependencies } from "../hosted-approved-mission";

const temporary: string[] = [];
afterEach(() => {
    for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture(missionId: PlaybookMb03MissionId) {
    const keys = generateKeyPairSync("ed25519");
    const providerKeys = generateKeyPairSync("ed25519");
    const root = realpathSync(mkdtempSync(join(tmpdir(), "mb03-playbook-hosted-")));
    temporary.push(root);
    const archiveRoot = join(root, "archive");
    mkdirSync(archiveRoot, { mode: 0o700 });
    const namespace = "mb03-hosted-staging-fixture";
    const state = GenesisStateRepository.createDisposable(join(root, "state.json"), namespace);
    const runtime = new ProductionRuntimeService(state);
    const systemId = "PLAYBOOK-SYSTEM-001";
    runtime.reconcileQueue(systemId, [{
        systemId, missionId, title: "Playbook Codex mission",
        rationale: "One exact file in an isolated staging sandbox",
        status: "QUEUED", dependencies: [], approvalRequired: true, evidenceIds: []
    }]);
    const repository = "sgwalton87/playbook-platform";
    const sourceSha = "a".repeat(40);
    const branch = "disposable/" + missionId.toLowerCase();
    const before = "# Tracked synthetic input\n";
    const after = "# Independently review this proposed Codex output\n";
    const target = { missionId, before, after };
    const path = playbookRemotePath(missionId);
    const scope = { branch, path, contentSha256: createHash("sha256").update(after).digest("hex") };
    const nonce = randomUUID();
    const payload = {
        schema: "pbos.hosted-mission-approval.v1" as const,
        missionId, repository, commit: sourceSha, operatorId: "registered-operator",
        scopeDigest: hostedMissionScopeDigest(scope),
        issuedAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce
    };
    const canonical = JSON.stringify([
        payload.schema, payload.missionId, payload.repository, payload.commit,
        payload.operatorId, payload.scopeDigest, payload.issuedAt, payload.expiresAt, payload.nonce
    ]);
    const approval = {
        payload,
        signatureBase64: sign(null, Buffer.from(canonical), keys.privateKey).toString("base64")
    };
    const request = {
        actorId: payload.operatorId, systemId, authorizationArtifactId: "hosted-approval:" + nonce,
        repository, branch, commit: sourceSha,
        approvedMissionIds: [missionId], maximumMissions: 1, autonomousContinuation: false,
        buildChannel: {
            channelId: "mb03-staging-build-channel", systemId, operatingSystemId: "PBOS",
            connectorId: "sandbox-provider", repository, domainRegistrationIds: ["playbook-staging"]
        }
    };
    const mission = createRemotePlaybookMission(sourceSha, "reviewed-remote-worker", namespace, nonce, target);
    const identity = { teamId: "team_Fixture", projectId: "prj_Fixture", token: "sandbox-controller-secret" };
    const issued = vi.fn(async () => ({
        id: nonce, token: "scoped-model-secret", expiresAt: new Date(Date.now() + 20_000).toISOString()
    }));
    const revoked = vi.fn(async () => undefined);
    const reserve = vi.fn(async () => undefined);
    const policy = {
        ...identity, providerId: "vercel-playbook-staging", authorityId: "registered-provider-authority",
        sourceSha, workerId: mission.workerId, playbook: target,
        image: "vcr.vercel.com/pbos-genesis/the-playbook/pbos-mb03-playbook-worker@sha256:" + "b".repeat(64),
        codexBinaryDigest: "c".repeat(64), model: "reviewed-model",
        credentials: async () => identity,
        signer: providerKeys.privateKey, dispatch: { reserve },
        modelLeases: { modelOrigin: "https://broker.example.invalid", issue: issued, revoke: revoked }
    };
    const vm = {
        image: policy.image, persistent: false, status: "running",
        expiresAt: new Date(Date.now() + 25_000),
        currentSession: () => ({ sessionId: "sandbox-isolated-fixture" }),
        runCommand: vi.fn(async (command: { cmd: string }) => ({
            exitCode: command.cmd === "curl" ? 6 : 0,
            stdout: async () => Buffer.from(after).toString("base64")
        })),
        updateNetworkPolicy: vi.fn(async () => undefined),
        stop: vi.fn(async () => ({ status: "stopped", id: "sandbox-isolated-fixture" }))
    };
    const api = {
        create: vi.fn(async (_options: object) => vm),
        get: vi.fn(async (_options: object) => vm)
    } as unknown as Pick<typeof Sandbox, "create" | "get">;
    const instance = new VercelPlaybookProvider(policy, api);
    const admission: HostedExecutionDependencies = {
        disposableNamespace: namespace,
        trustedPublicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
        canonicalStateVerified: vi.fn(async () => true),
        hostAttested: vi.fn(async () => true),
        acquireFencedLease: vi.fn(async (resource, ownerId) => ({ resource, ownerId, fencingToken: 1n })),
        assertFencedLease: vi.fn(async () => true),
        renewFencedLease: vi.fn(async () => true),
        releaseFencedLease: vi.fn(async () => undefined),
        recordApprovalNonce: vi.fn(async () => true)
    };
    const trust = {
        authorityId: policy.authorityId, providerId: policy.providerId,
        publicKey: providerKeys.publicKey, isolationProfile: instance.isolationProfile,
        archive: new RemoteEvidenceArchive(archiveRoot, 90), timeoutMs: 30_000
    };
    const checkpoints = { commit: vi.fn(async (_lease: unknown, _mission: string,
        _repository: string, version: bigint, _bytes: Uint8Array) => version + 1n) };
    const sealed = vi.fn(async (bytes: Uint8Array) => bytes);
    const composition = {
        input: { request, approval, mission, scope },
        policy,
        adapters: {
            runner: new ProductionMissionRunner(state, runtime),
            admission, trust, checkpoints, sealCheckpoint: sealed
        }
    };
    return { composition, state, vm, api, reserve, issued, revoked, sealed, checkpoints };
}

describe("MB-03 composed hosted Playbook Codex execution", () => {
    it.each(["MB03-MISSION-001", "MB03-MISSION-002"] as const)(
        "adopts one signed %s provider return, then stops before independent certification",
        async missionId => {
            const f = fixture(missionId);
            const result = await executeHostedPlaybookCodexMission(f.composition, f.api);
            expect(result.stopReason).toBe("INDEPENDENT_VERIFICATION_REQUIRED");
            expect(result.runs).toHaveLength(1);
            expect(result.runs[0].status).toBe("PAUSED");
            expect(f.reserve).toHaveBeenCalledOnce();
            expect(f.issued).toHaveBeenCalledOnce();
            expect(f.revoked).toHaveBeenCalledOnce();
            expect(f.vm.stop).toHaveBeenCalledOnce();
            expect(f.checkpoints.commit).toHaveBeenCalledOnce();
            expect(f.vm.runCommand.mock.calls.some(([command]) => command.cmd === "runuser")).toBe(true);
            expect(f.state.executionLeases().at(-1)?.status).toBe("RELEASED");
            const envelope = JSON.stringify(f.sealed.mock.calls);
            expect(envelope).not.toContain("sandbox-controller-secret");
            expect(envelope).not.toContain("scoped-model-secret");
        }
    );

    it("rejects mismatched source image before any external operation", () => {
        const f = fixture("MB03-MISSION-001");
        const altered = { ...f.composition, policy: {
            ...f.composition.policy, sourceSha: "d".repeat(40)
        }};
        expect(() => prepareHostedPlaybookCodexMission(altered, f.api)).toThrow("exact reviewed authority");
        expect(f.reserve).not.toHaveBeenCalled();
        expect(f.checkpoints.commit).not.toHaveBeenCalled();
    });

    it("rejects a provider signing key not matching the independently trusted public key", () => {
        const f = fixture("MB03-MISSION-001");
        const unrelated = generateKeyPairSync("ed25519");
        expect(() => prepareHostedPlaybookCodexMission({
            ...f.composition, policy: { ...f.composition.policy, signer: unrelated.privateKey }
        }, f.api)).toThrow("exact reviewed authority");
        expect(f.reserve).not.toHaveBeenCalled();
    });

    it("rejects forged signed file scope and after digest before acquiring any lease", () => {
        const f = fixture("MB03-MISSION-001");
        const target = { ...f.composition.policy.playbook, after: "# unapproved content\n" };
        expect(() => prepareHostedPlaybookCodexMission({
            ...f.composition, policy: { ...f.composition.policy, playbook: target }
        }, f.api)).toThrow("exact reviewed authority");
        expect(f.checkpoints.commit).not.toHaveBeenCalled();
    });

    it("rejects a third mission, wrong worker identity, and Core image namespace", () => {
        const f = fixture("MB03-MISSION-001");
        expect(() => prepareHostedPlaybookCodexMission({
            ...f.composition, input: {
                ...f.composition.input,
                mission: { ...f.composition.input.mission, missionId: "MB03-MISSION-003" }
            }
        }, f.api)).toThrow("exact reviewed authority");
        expect(() => prepareHostedPlaybookCodexMission({
            ...f.composition, input: {
                ...f.composition.input, mission: { ...f.composition.input.mission, workerId: "wrong-worker" }
            }
        }, f.api)).toThrow("exact reviewed authority");
        expect(() => prepareHostedPlaybookCodexMission({
            ...f.composition, policy: {
                ...f.composition.policy, image: "fixture/core-canary@sha256:" + "b".repeat(64)
            }
        }, f.api)).toThrow("immutable sandbox image namespace");
    });

    it("rejects an unapproved isolation profile even if source and output hashes match", () => {
        const f = fixture("MB03-MISSION-001");
        const altered = {
            ...f.composition, adapters: {
                ...f.composition.adapters,
                trust: { ...f.composition.adapters.trust, isolationProfile: "f".repeat(64) }
            }
        };
        expect(() => prepareHostedPlaybookCodexMission(altered, f.api)).toThrow("isolation profile");
    });
});
