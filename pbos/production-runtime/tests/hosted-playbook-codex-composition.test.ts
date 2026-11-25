import { createDecipheriv, createHash, randomBytes, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sandbox } from "@vercel/sandbox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkpointSealer } from "../../tools/mb03-hosted-executor";
import { createFencedPlaybookPr } from "../fenced-playbook-pr-executor";
import { GitHubAppPlaybookPrApi } from "../github-app-playbook-pr-api";
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

function fixture(missionId: PlaybookMb03MissionId, openState = GenesisStateRepository.createDisposable) {
    const keys = generateKeyPairSync("ed25519");
    const providerKeys = generateKeyPairSync("ed25519");
    const root = realpathSync(mkdtempSync(join(tmpdir(), "mb03-playbook-hosted-")));
    temporary.push(root);
    const archiveRoot = join(root, "archive");
    mkdirSync(archiveRoot, { mode: 0o700 });
    const namespace = "mb03-hosted-staging-fixture";
    const state = openState(join(root, "state.json"), namespace);
    const runtime = new ProductionRuntimeService(state);
    const systemId = "PLAYBOOK-SYSTEM-001";
    runtime.reconcileQueue(systemId, [{
        systemId, missionId, title: "Playbook Codex mission",
        rationale: "One exact file in an isolated staging sandbox",
        status: "QUEUED", dependencies: [], approvalRequired: true, evidenceIds: []
    }]);
    const repository = "sgwalton87/playbook-platform";
    const sourceSha = "a".repeat(40);
    const branch = "pbos/mission-" + missionId;
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
        create: vi.fn(async (_options: object) => {
            vm.expiresAt = new Date(Date.now() + 25_000);
            return vm;
        }),
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
    return { root, composition, state, vm, api, reserve, issued, revoked, sealed, checkpoints };
}

describe("MB-03 composed hosted Playbook Codex execution", () => {
    it("passes the plan-ready state write under 429 throttling and hands off exactly once", async () => {
        let injected = false;
        const f = fixture("MB03-MISSION-001", (path, namespace) => {
            GenesisStateRepository.createDisposable(path, namespace);
            let current = { bytes: readFileSync(path, "utf8"), generation: "1" };
            return new GenesisStateRepository(path, namespace, { managedRemote: true, versionedObject: {
                read: () => current,
                replace(expected, bytes) {
                    const previous = JSON.parse(current.bytes);
                    const throttle = !injected && previous.productionRuns?.[0]?.status === "RUNNING" &&
                        previous.productionEvents?.at(-1)?.type === "EXECUTION_PLAN_READY";
                    const reply = execFileSync(process.execPath, [join(__dirname, "fixtures/throttled-state-replace.cjs")], {
                        input: JSON.stringify({ current, expected, bytes, throttle }), encoding: "utf8"
                    });
                    const receipt = JSON.parse(reply);
                    current = receipt.current;
                    if (receipt.throttled) injected = true;
                }
            } });
        });
        const result = await executeHostedPlaybookCodexMission(f.composition, f.api);
        expect(injected).toBe(true);
        expect(f.composition.adapters.admission.recordApprovalNonce).toHaveBeenCalledOnce();
        expect(f.reserve).toHaveBeenCalledOnce();
        expect(f.api.create).toHaveBeenCalledOnce();
        expect(f.checkpoints.commit).toHaveBeenCalledOnce();
        expect(f.state.executionLeases().at(-1)?.status).toBe("RELEASED");
        expect(result.stopReason).toBe("INDEPENDENT_VERIFICATION_REQUIRED");
    }, 45_000);
    it("reopens a plan-ready interruption without spending another nonce or starting a worker", async () => {
        let stateFile = "";
        let saved = { bytes: "", generation: "1" };
        let interrupted = false;
        const open = (path: string, namespace: string) => new GenesisStateRepository(path, namespace, {
            managedRemote: true, versionedObject: {
                read: () => saved,
                replace(expected, bytes) {
                    if (expected !== saved.generation) throw Error("stale fixture generation");
                    const state = JSON.parse(saved.bytes);
                    if (state.productionRuns?.[0]?.status === "RUNNING" &&
                        state.productionEvents?.at(-1)?.type === "EXECUTION_PLAN_READY") {
                        interrupted = true;
                        throw Error("fixture controller stopped after plan persistence");
                    }
                    saved = { bytes, generation: String(Number(expected) + 1) };
                }
            }
        });
        const f = fixture("MB03-MISSION-001", (path, namespace) => {
            GenesisStateRepository.createDisposable(path, namespace);
            stateFile = path;
            saved.bytes = readFileSync(path, "utf8");
            return open(path, namespace);
        });
        await expect(executeHostedPlaybookCodexMission(f.composition, f.api)).rejects.toThrow("after plan persistence");
        expect(interrupted).toBe(true);
        const beforeRestart = { ...saved };
        const admission = f.composition.adapters.admission;
        expect(admission.recordApprovalNonce).toHaveBeenCalledOnce();
        const reopened = open(stateFile, admission.disposableNamespace);
        f.composition.adapters.runner = new ProductionMissionRunner(reopened);
        await expect(executeHostedPlaybookCodexMission(f.composition, f.api)).rejects.toThrow("active run or lease");
        expect(saved).toEqual(beforeRestart);
        expect(f.reserve).not.toHaveBeenCalled();
        expect(f.api.create).not.toHaveBeenCalled();
        expect(admission.recordApprovalNonce).toHaveBeenCalledOnce();
    });

    it("publishes the verified tracked-file bytes once even when the draft PR acknowledgment is lost", async () => {
        const f = fixture("MB03-MISSION-001");
        const checkpointFile = join(f.root, "worker-output.sealed");
        const testKey = randomBytes(32);
        f.sealed.mockImplementation(checkpointSealer(testKey.toString("base64")));
        f.checkpoints.commit.mockImplementation(async (_lease, missionId, repo, version, bytes) => {
            expect(missionId).toBe("MB03-MISSION-001");
            expect(repo).toBe(f.composition.input.request.repository);
            expect(version).toBe(0n);
            writeFileSync(checkpointFile, bytes, { flag: "wx", mode: 0o600 });
            return 1n;
        });
        const workerResult = await executeHostedPlaybookCodexMission(f.composition, f.api);
        expect(workerResult.stopReason).toBe("INDEPENDENT_VERIFICATION_REQUIRED");
        const { mission, scope, request, approval } = f.composition.input;
        expect(workerResult.runs[0].disposableAttempt).toMatchObject({
            missionId: mission.missionId, attemptId: approval.payload.nonce, scopeDigest: approval.payload.scopeDigest
        });
        function openCheckpoint(bytes: Buffer) {
            expect(bytes[0]).toBe(1);
            const decipher = createDecipheriv("aes-256-gcm", testKey, bytes.subarray(1, 13));
            decipher.setAuthTag(bytes.subarray(13, 29));
            return Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]);
        }
        const ciphertext = readFileSync(checkpointFile);
        const tampered = Buffer.from(ciphertext);
        tampered[13] ^= 1;
        expect(() => openCheckpoint(tampered)).toThrow();
        const output = JSON.parse(openCheckpoint(ciphertext).toString("utf8"));
        expect(workerResult.runs[0].evidenceIds).toContain(output.remoteEvidenceDigest);
        expect(workerResult.runs[0].evidenceIds).toContain("hosted-remote-checkpoint:v1");
        expect(f.composition.adapters.trust.archive.read(output.remoteEvidenceDigest)).toMatchObject({
            binding: {mission: {missionId: mission.missionId, attemptId: approval.payload.nonce}},
            manifest: [{path: scope.path, digest: scope.contentSha256}]
        });
        const content = Buffer.from(output.contentBase64, "base64");
        expect(output).toMatchObject({ missionId: mission.missionId, repository: request.repository,
            revision: request.commit, path: scope.path });
        expect(createHash("sha256").update(content).digest("hex")).toBe(scope.contentSha256);
        const proposal = { repository: "sgwalton87/playbook-platform" as const, baseSha: request.commit,
            branch: scope.branch, path: scope.path, missionId: mission.missionId, content: content.toString("utf8"),
            title: "Review fixture change", body: "Fixture proposal from the verified worker output" };
        const blob = (bytes: Buffer) => createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
        const original = blob(Buffer.from(f.composition.policy.playbook.before));
        const changed = blob(content);
        const newHead = "c".repeat(40);
        let head: string | undefined;
        let draft = false;
        const writes: string[] = [];
        const repoInfo = { full_name: proposal.repository };
        const pr = { number: 1, html_url: "https://github.com/sgwalton87/playbook-platform/pull/1", draft: true,
            head: { ref: scope.branch, sha: newHead, repo: repoInfo },
            base: { ref: "main", sha:request.commit, repo: repoInfo }, state: "open" };
        const github = new GitHubAppPlaybookPrApi("fixture", async (url, options) => {
            const route = new URL(String(url)).pathname.replace("/repos/" + proposal.repository, "");
            const method = options?.method ?? "GET";
            if (method !== "GET") writes.push(method + " " + route);
            const body = options?.body ? JSON.parse(String(options.body)) : {};
            if (method === "GET" && route === "/git/ref/heads/main") return Response.json({object:{sha:request.commit}});
            if (method === "GET" && route === "/git/ref/heads/" + scope.branch) return head ?
                Response.json({object:{sha:head}}) : new Response(null, {status:404});
            if (method === "GET" && route === "/pulls") return Response.json(draft ? [pr] : []);
            if (method === "GET" && route.startsWith("/git/trees/")) {
                const rev = route.slice("/git/trees/".length);
                expect([request.commit, newHead]).toContain(rev);
                return Response.json({truncated:false, tree:[{type:"blob", mode:"100644", path:scope.path,
                    sha: rev === request.commit ? original : changed}]});
            }
            if (method === "POST" && route === "/git/refs") {
                expect(body).toEqual({ref:"refs/heads/" + scope.branch, sha:request.commit});
                head = request.commit;
                return Response.json({});
            }
            if (method === "POST" && route === "/graphql") {
                const patch = body.variables.input;
                expect(patch.branch).toEqual({repositoryNameWithOwner:request.repository, branchName:scope.branch});
                expect(patch.expectedHeadOid).toBe(request.commit);
                if (patch.expectedHeadOid !== head) return Response.json({errors:[{message:"stale branch"}]});
                expect(patch.fileChanges).toEqual({additions:[{path:scope.path, contents:output.contentBase64}]});
                head = newHead;
                return Response.json({data:{createCommitOnBranch:{commit:{oid:head}}}});
            }
            if (method === "GET" && route === "/commits/" + newHead) return Response.json({
                sha:newHead, parents:[{sha:request.commit}], files:[{filename:scope.path, status:"modified", sha:changed}] });
            if (method === "GET" && route === "/contents/" + scope.path) return Response.json({encoding:"base64",content:output.contentBase64});
            if (method === "POST" && route === "/pulls") {
                expect(body).toMatchObject({head:scope.branch, base:"main", draft:true});
                draft = true;
                throw Error("fixture lost response after GitHub created draft");
            }
            throw Error("Unexpected fixture request: " + method + " " + route);
        });
        const lease = {resource:"pbos:mission:" + request.repository + ":" + mission.missionId,
            ownerId:"fixture-publisher", fencingToken:2n};
        const publish = () => createFencedPlaybookPr(github, lease, async () => true, proposal);
        await expect(publish()).rejects.toThrow("lost response");
        await expect(publish()).resolves.toMatchObject({number:1, branch:scope.branch, headSha:newHead, fileOperation:"modified"});
        expect(writes).toEqual(["POST /git/refs", "POST /graphql", "POST /pulls"]);
        expect(f.api.create).toHaveBeenCalledOnce();
        expect(f.checkpoints.commit).toHaveBeenCalledOnce();
    });

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
