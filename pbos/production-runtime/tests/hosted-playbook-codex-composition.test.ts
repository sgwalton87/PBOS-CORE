import { continueHostedRemoteWorkerMission } from "../hosted-remote-worker-mission";
import { publishPlanReadyOutput } from "../hosted-plan-ready-publication";
import type { ProductionMissionSequence } from "../production-mission-runner";
import { createDecipheriv, createHash, randomBytes, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { hostname, tmpdir } from "node:os";
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
import { orphan } from "../../tools/tests/fixtures/disposable-gcs-object";
import { inspectHostedPlanReady, prepareHostedPlanReadyHandoff } from "../hosted-plan-ready-inspection";
import type { NeonLeaseSql } from "../neon-fenced-lease-provider";
import { preparePlanReadyLeaseHandoff } from "../plan-ready-lease-handoff";
import { inspectMb03Recovery } from "../../master-builder/mb03-disposable-mission";
import { hostedMissionScopeDigest, planReadyRecoveryDigest, type PlanReadyRecoveryAuthorization, type SignedPlanReadyApproval } from "../hosted-signed-mission-approval";
import { VercelPlaybookProvider } from "../../master-builder/vercel-remote-provider";
import { createRemotePlaybookMission, playbookRemotePath } from "../../master-builder/playbook-remote-mission";
import type { PlaybookMb03MissionId } from "../../master-builder/playbook-remote-mission";
import { RemoteEvidenceArchive } from "../../master-builder/remote-evidence-archive";
import { runHostedApprovedMission, type HostedExecutionDependencies } from "../hosted-approved-mission";

const temporary: string[] = [];
afterEach(() => {
    vi.useRealTimers();
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
    function fixtureApproval<T extends typeof payload | SignedPlanReadyApproval["payload"]>(value: T) {
        const canonical = JSON.stringify([
            value.schema, value.missionId, value.repository, value.commit,
            value.operatorId, value.scopeDigest, value.issuedAt, value.expiresAt, value.nonce
        ]);
        return {
            payload: value,
            signatureBase64: sign(null, Buffer.from(canonical), keys.privateKey).toString("base64")
        };
    }
    const approval = fixtureApproval(payload);
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
    return { root, composition, state, vm, api, reserve, issued, revoked, sealed, checkpoints, fixtureApproval };
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

    it("recovers the killed controller through verified worker output and one draft after a lost acknowledgment", async () => {
        const f = fixture("MB03-MISSION-001");
        const { request, approval, scope } = f.composition.input;
        const admission = f.composition.adapters.admission;
        const child = spawnSync(process.execPath, [
            "--import", require.resolve("tsx"), join(__dirname, "fixtures/interrupt-hosted-controller.ts")
        ], {
            cwd: f.root, encoding: "utf8", timeout: 15_000, env: { PATH: process.env.PATH },
            input: JSON.stringify({ request, approval, scope, publicKey: admission.trustedPublicKeyPem })
        });
        expect(child.error).toBeUndefined();
        expect(child.signal, child.stderr).toBe("SIGKILL");
        const file = join(f.root, "state.json");
        const before = readFileSync(file);
        const reopened = new GenesisStateRepository(file, admission.disposableNamespace);
        const runs = reopened.productionRuns();
        expect(runs).toHaveLength(1);
        const [run] = runs;
        expect(run).toMatchObject({ status: "RUNNING", disposableAttempt: { attemptId: approval.payload.nonce } });
        expect(reopened.productionEvents(run.runId).at(-1)?.type).toBe("EXECUTION_PLAN_READY");
        expect(reopened.executionLeases()).toHaveLength(1);
        expect(reopened.executionLeases()[0]).toMatchObject({ runId: run.runId, processId: child.pid, status: "ACTIVE" });
        expect(inspectMb03Recovery(reopened, run.runId)).toMatchObject({ lease: "EXPIRED", phase: "HOSTED_JOURNAL_REQUIRED" });

        const runner = new ProductionMissionRunner(reopened);
        const fresh = f.fixtureApproval({ ...approval.payload, nonce: randomUUID() });
        for (const envelope of [approval, fresh]) {
            const result = runHostedApprovedMission(runner,
                { ...request, authorizationArtifactId: "hosted-approval:" + envelope.payload.nonce },
                envelope, admission, scope, () => { throw Error("Unexpected worker selection"); });
            await expect(result).rejects.toThrow("already has an active run or lease");
        }
        expect(admission.acquireFencedLease).not.toHaveBeenCalled();
        expect(admission.recordApprovalNonce).not.toHaveBeenCalled();
        expect(readFileSync(join(f.root, "nonce.fixture"), "utf8")).toBe(approval.payload.nonce);
        expect(existsSync(join(f.root, "worker-started.fixture"))).toBe(false);
        expect(readFileSync(file).equals(before)).toBe(true);

        // Advance wall time only. The consumed signature is now historical;
        // a current recovery signature must independently authorize the same run.
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.parse(approval.payload.expiresAt) + 1_000);
        const window = { issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() };
        const old = reopened.executionLeases()[0];
        const pin = { runId: run.runId, missionId: approval.payload.missionId, repository: run.repository,
            commit: run.startingCommit, nonce: approval.payload.nonce, scopeDigest: approval.payload.scopeDigest,
            oldLeaseId: old.leaseId, stateGeneration: "71", lockGeneration: "72",
            stateSha256: createHash("sha256").update(before).digest("hex") };
        const owner = { pid: process.pid, host: hostname(), now: new Date(), expiresAt: new Date(Date.now() + 30_000),
            fence: { ownerId: randomUUID(), resource: "pbos:mission:" + run.repository + ":" + pin.missionId, fencingToken: 2n } };
        const observations = { terminatedController: child.signal === "SIGKILL", journal: "absent" as const,
            checkpointCount: 0, consumedNonce: readFileSync(join(f.root, "nonce.fixture"), "utf8"), fenceCurrent: true };
        for (const journal of ["reserved", "unknown"] as const) {
            expect(() => preparePlanReadyLeaseHandoff(before.toString(), pin, owner, { ...observations, journal }))
                .toThrow("RECOVERY_EXTERNAL_EVIDENCE");
        }
        for (const changed of [{ fenceCurrent: false }, { terminatedController: false }, { checkpointCount: 1 }]) {
            expect(() => preparePlanReadyLeaseHandoff(before.toString(), pin, owner, { ...observations, ...changed }))
                .toThrow("RECOVERY_EXTERNAL_EVIDENCE");
        }
        for (const changed of [{ nonce: randomUUID() }, { stateSha256: "0".repeat(64) },
            { oldLeaseId: randomUUID() }, { commit: "b".repeat(40) }]) {
            expect(() => preparePlanReadyLeaseHandoff(before.toString(), { ...pin, ...changed }, owner, observations)).toThrow(/RECOVERY_/);
        }
        const scratch = orphan(before.toString());
        const execution = { name: "projects/pbos-genesis-staging/locations/us-west1/jobs/pbos-mb03-playbook-codex/executions/pbos-mb03-playbook-codex-fixture", uid: randomUUID() };
        const review = { pin, execution };
        const terminal = { ...execution, job: "pbos-mb03-playbook-codex", taskCount: 1, failedCount: 1,
            completionTime: owner.now.toISOString(), conditions: [{ type: "Completed", state: "CONDITION_FAILED" }] };
        const http = vi.fn(async () => Response.json(terminal));
        const dbResult = { consumed: true, checkpoint_absent: true, fence_matches: true };
        const query = vi.fn(async () => ({ rows: [dbResult] }));
        const reads = { accessToken: async () => "fixture", http, journal: { assertUnreserved: vi.fn(async () => {}) },
            db: { query } as unknown as NeonLeaseSql, readPinnedPair: () => scratch.inspect() };
        await expect(inspectHostedPlanReady(reads, review)).resolves.toMatchObject({
            status: "PLAN_READY_CHECKPOINT_OBSERVED", runId: run.runId, leaseAcquired: false, missionExecutionAuthorized: false
        });
        expect(query.mock.lastCall).toEqual([expect.stringContaining("NOT EXISTS(SELECT 1 FROM pbos_runner.execution_lease"),
            [pin.nonce, pin.missionId, owner.fence.resource]]);
        for (const changed of [{ uid: randomUUID() }, { reconciling: true }, { runningCount: 1 },
            { completionTime: null }, { conditions: [{ type: "Completed", state: "CONDITION_PENDING" }] }]) {
            http.mockResolvedValueOnce(Response.json({ ...terminal, ...changed }));
            await expect(prepareHostedPlanReadyHandoff(reads, owner.fence, review)).rejects.toThrow("RECOVERY_EXECUTION_NOT_TERMINAL");
        }
        http.mockResolvedValueOnce(new Response(null, { status: 403 }));
        await expect(inspectHostedPlanReady(reads, review)).rejects.toThrow("RECOVERY_EXECUTION_HTTP_403");
        for (const changed of [{ consumed: false }, { checkpoint_absent: false }, { fence_matches: false }]) {
            query.mockResolvedValueOnce({ rows: [{ ...dbResult, ...changed }] });
            await expect(prepareHostedPlanReadyHandoff(reads, owner.fence, review)).rejects.toThrow("RECOVERY_NEON_LINEAGE");
        }
        reads.journal.assertUnreserved.mockRejectedValueOnce(Error("RECOVERY_DISPATCH_RESERVED"));
        await expect(prepareHostedPlanReadyHandoff(reads, owner.fence, review)).rejects.toThrow("RECOVERY_DISPATCH_RESERVED");
        expect(scratch.http.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
        const prepared = await prepareHostedPlanReadyHandoff(reads, owner.fence, review);
        expect(query.mock.lastCall).toEqual([expect.stringContaining("owner_id=$4::uuid AND fencing_token=$5::bigint"),
            [pin.nonce, pin.missionId, owner.fence.resource, owner.fence.ownerId, owner.fence.fencingToken.toString()]]);
        const receipt = await scratch.transfer(prepared.bytes);
        const readback = await scratch.call("read");
        expect(readback).toEqual({ generation: receipt.generation, bytes: prepared.bytes });
        await expect(scratch.transfer(prepared.bytes)).rejects.toThrow("STATE_RECOVERY_PIN");
        // Reopen the verified scratch bytes through the repository used by the replacement owner.
        writeFileSync(file, readback.bytes);
        const recovered = new GenesisStateRepository(file, admission.disposableNamespace);
        expect(recovered.productionRuns()).toEqual(runs);
        expect(recovered.productionEvents(run.runId)).toEqual(JSON.parse(before.toString()).productionEvents);
        expect(recovered.executionLeases()).toEqual([{ ...old, status: "STALE", releaseMethod: "RECOVERED" }, prepared.lease]);
        expect(() => recovered.renewDisposableLease(run.runId, old.host, child.pid!, owner.now,
            owner.expiresAt.toISOString(), old.leaseId)).toThrow(/lost or expired/);
        expect(recovered.renewDisposableLease(run.runId, owner.host, owner.pid, owner.now,
            owner.expiresAt.toISOString(), prepared.lease.leaseId).runId).toBe(run.runId);
        expect(readFileSync(join(f.root, "nonce.fixture"), "utf8")).toBe(pin.nonce);
        expect(existsSync(join(f.root, "worker-started.fixture"))).toBe(false);

        // Re-enter through the normal hosted composition after verified scratch handoff.
        // A transferred lease alone must never admit a second run or consume a fresh nonce.
        f.composition.adapters.runner = new ProductionMissionRunner(recovered);
        const snapshotAfterHandoff = readFileSync(file);
        for (const envelope of [approval, f.fixtureApproval({ ...fresh.payload, ...window })]) {
            const nonce = envelope.payload.nonce;
            const target = f.composition.policy.playbook;
            const mission = createRemotePlaybookMission(request.commit, f.composition.policy.workerId,
                admission.disposableNamespace, nonce, target);
            const input = { ...f.composition.input, approval: envelope, mission,
                request: { ...request, authorizationArtifactId: "hosted-approval:" + nonce } };
            await expect(executeHostedPlaybookCodexMission({ ...f.composition, input }, f.api))
                .rejects.toThrow(envelope === approval ? "signature or lineage invalid" : "already has an active run or lease");
        }
        expect(readFileSync(file)).toEqual(snapshotAfterHandoff);
        expect(recovered.productionRuns().map(r => r.runId)).toEqual([pin.runId]);
        expect(admission.acquireFencedLease).not.toHaveBeenCalled();
        expect(admission.recordApprovalNonce).not.toHaveBeenCalled();
        expect(f.reserve).not.toHaveBeenCalled();
        expect(f.api.create).not.toHaveBeenCalled();
        expect(f.checkpoints.commit).not.toHaveBeenCalled();

        const publicationBase = "d".repeat(40);
        const recoveryPayload = { ...approval.payload, ...window, schema: "pbos.hosted-plan-ready-recovery.v1" as const,
            nonce: randomUUID(), scopeDigest: planReadyRecoveryDigest(pin, publicationBase) };
        const recovery = { pin, publicationBase, approval: f.fixtureApproval(recoveryPayload) };
        const adapters = prepareHostedPlaybookCodexMission(f.composition, f.api);
        const readGit = vi.fn(async (url: string | URL | Request) => {
            const route = new URL(String(url)).pathname;
            if (route.endsWith("/git/ref/heads/main")) return Response.json({object:{sha:publicationBase}});
            if (route.endsWith("/git/commits/" + pin.commit) || route.endsWith("/git/commits/" + publicationBase)) {
                return Response.json({sha:route.split("/").at(-1),tree:{sha:"e".repeat(40)},parents:[{sha:pin.commit}]});
            }
            throw Error("Unexpected Git read");
        });
        const branchReads = new GitHubAppPlaybookPrApi("fixture", readGit);
        const resume = (auth = recovery, fence = owner.fence) => continueHostedRemoteWorkerMission(f.composition.input,
            adapters, auth, fence, branchReads);
        await expect(resume({ ...recovery, publicationBase: request.commit })).rejects.toThrow("RECOVERY_AUTHORIZATION");
        await expect(resume({ ...recovery, pin: { ...pin, stateGeneration: "101" } })).rejects.toThrow("RECOVERY_AUTHORIZATION");
        await expect(resume({ ...recovery, approval: f.fixtureApproval({ ...recoveryPayload, nonce: pin.nonce }) }))
            .rejects.toThrow("RECOVERY_AUTHORIZATION");
        await expect(resume({ ...recovery, approval: f.fixtureApproval({ ...recoveryPayload,
            issuedAt: new Date(0).toISOString(), expiresAt: new Date(60_000).toISOString() }) })).rejects.toThrow("RECOVERY_AUTHORIZATION");
        await expect(resume()).rejects.toThrow("RECOVERY_HOST_BINDINGS");
        Object.assign(admission, { durableStateVerified: vi.fn(async () => true) });
        await expect(resume(recovery, { ...owner.fence, fencingToken: 1n })).rejects.toThrow("RECOVERY_FENCE");
        readGit.mockResolvedValueOnce(Response.json({object:{sha:"f".repeat(40)}}));
        await expect(resume()).rejects.toThrow("RECOVERY_PUBLICATION_BASE");
        vi.mocked(admission.assertFencedLease).mockResolvedValueOnce(false);
        await expect(resume()).rejects.toThrow("RECOVERY_FENCE_OR_EXPIRY");
        expect(admission.recordApprovalNonce).not.toHaveBeenCalled();
        vi.mocked(admission.recordApprovalNonce).mockResolvedValueOnce(false);
        await expect(resume()).rejects.toThrow("RECOVERY_NONCE_USED");
        expect(readFileSync(file)).toEqual(snapshotAfterHandoff);
        expect(f.api.create).not.toHaveBeenCalled();
        const result = await verifyPublicationFixture(f, resume, recovery);
        const archive = f.composition.adapters.trust.archive.read(result.runs[0].evidenceIds.find(id => /^[a-f0-9]{64}$/.test(id))!);
        expect(archive).toMatchObject({ recovery, binding: { mission: { attemptId: pin.nonce },
            approvalDigest: createHash("sha256").update(recovery.approval.signatureBase64).digest("hex") } });
        expect(result.runs.map(r => r.runId)).toEqual([pin.runId]);
        expect(recovered.productionRuns()).toHaveLength(1);
        expect(result.runs[0].disposableAttempt).toEqual(run.disposableAttempt);
        expect(recovered.productionStages(pin.runId).find(s => s.type === "EXECUTION")?.inputs).toMatchObject({
            planId: run.executionPlan!.planId, originalNonce: pin.nonce, recoveryNonce: recoveryPayload.nonce, publicationBase });
        await expect(resume()).rejects.toThrow("RECOVERY_CHECKPOINT");
        expect(f.reserve).toHaveBeenCalledOnce();
        expect(admission.acquireFencedLease).not.toHaveBeenCalled();
        expect(admission.recordApprovalNonce).toHaveBeenLastCalledWith(recoveryPayload.nonce, pin.missionId, pin.repository, recoveryPayload.expiresAt);
    }, 20_000);

    it("publishes the verified tracked-file bytes once even when the draft PR acknowledgment is lost", async () => {
        const f = fixture("MB03-MISSION-001");
        await verifyPublicationFixture(f, () => executeHostedPlaybookCodexMission(f.composition, f.api));
    });

    it.each(["different tree", "unrelated parent", "wrong SHA", "missing tree"])(
        "rejects a recovery publication base with %s through read-only Git requests", async defect => {
            const source = "a".repeat(40), base = "b".repeat(40), tree = "c".repeat(40);
            const api = new GitHubAppPlaybookPrApi("fixture", async (url, options) => {
                expect(options?.method).toBe("GET");
                const path = new URL(String(url)).pathname;
                if (path.endsWith("/heads/main")) return Response.json({ object: { sha: base } });
                if (path.endsWith(source)) return Response.json({ sha: source, tree: { sha: tree } });
                return Response.json({ sha: defect === "wrong SHA" ? source : base,
                    tree: defect === "missing tree" ? {} : { sha: defect === "different tree" ? base : tree },
                    parents: [{ sha: defect === "unrelated parent" ? tree : source }] });
            });
            await expect(api.assertRecoveryPublicationBase("sgwalton87/playbook-platform", source, base))
                .rejects.toThrow("RECOVERY_PUBLICATION_LINEAGE");
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

async function verifyPublicationFixture(f: ReturnType<typeof fixture>, execute: () => Promise<ProductionMissionSequence>,
    recovery?: PlanReadyRecoveryAuthorization) {
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
    const workerResult = await execute();
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
    const plaintext = openCheckpoint(ciphertext);
    const output = JSON.parse(plaintext.toString("utf8"));
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
    const publicationBase = recovery?.publicationBase ?? request.commit;
    const proposal = { repository: "sgwalton87/playbook-platform" as const, baseSha: publicationBase,
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
        base: { ref: "main", sha:publicationBase, repo: repoInfo }, state: "open" };
    let mainHead = publicationBase;
    const github = new GitHubAppPlaybookPrApi("fixture", async (url, options) => {
        const route = new URL(String(url)).pathname.replace("/repos/" + proposal.repository, "");
        const method = options?.method ?? "GET";
        if (method !== "GET") writes.push(method + " " + route);
        const body = options?.body ? JSON.parse(String(options.body)) : {};
        if (method === "GET" && route === "/git/ref/heads/main") return Response.json({object:{sha:mainHead}});
        if (method === "GET" && route === "/git/ref/heads/" + scope.branch) return head ?
            Response.json({object:{sha:head}}) : new Response(null, {status:404});
        if (method === "GET" && route.startsWith("/git/commits/")) {
            const sha = route.slice("/git/commits/".length);
            expect([request.commit, publicationBase]).toContain(sha);
            return Response.json({ sha, tree: { sha: "e".repeat(40) }, parents: [{ sha: request.commit }] });
        }
        if (method === "GET" && route === "/pulls") return Response.json(draft ? [pr] : []);
        if (method === "GET" && route.startsWith("/git/trees/")) {
            const rev = route.slice("/git/trees/".length);
            expect([publicationBase, newHead]).toContain(rev);
            return Response.json({truncated:false, tree:[{type:"blob", mode:"100644", path:scope.path,
                sha: rev === publicationBase ? original : changed}]});
        }
        if (method === "POST" && route === "/git/refs") {
            expect(body).toEqual({ref:"refs/heads/" + scope.branch, sha:publicationBase});
            head = publicationBase;
            return Response.json({});
        }
        if (method === "POST" && route === "/graphql") {
            const patch = body.variables.input;
            expect(patch.branch).toEqual({repositoryNameWithOwner:request.repository, branchName:scope.branch});
            expect(patch.expectedHeadOid).toBe(publicationBase);
            if (patch.expectedHeadOid !== head) return Response.json({errors:[{message:"stale branch"}]});
            expect(patch.fileChanges).toEqual({additions:[{path:scope.path, contents:output.contentBase64}]});
            head = newHead;
            return Response.json({data:{createCommitOnBranch:{commit:{oid:head}}}});
        }
        if (method === "GET" && route === "/commits/" + newHead) return Response.json({
            sha:newHead, parents:[{sha:publicationBase}], files:[{filename:scope.path, status:"modified", sha:changed}] });
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
    if (recovery) {
        const attemptPublish = (checkpoint: unknown, current: boolean) => publishPlanReadyOutput(github, lease, async () => current,
            workerResult.runs[0], recovery, scope, f.composition.adapters.admission.trustedPublicKeyPem, Buffer.from(JSON.stringify(checkpoint)));
        await expect(attemptPublish({ ...output, publicationBase: request.commit }, true)).rejects.toThrow("RECOVERY_CHECKPOINT_DIGEST");
        await expect(attemptPublish({ ...output, recoveryNonce: randomUUID() }, true)).rejects.toThrow("RECOVERY_CHECKPOINT_DIGEST");
        await expect(attemptPublish({ ...output, contentBase64: Buffer.from("different").toString("base64") }, true))
            .rejects.toThrow("RECOVERY_CHECKPOINT_DIGEST");
        await expect(attemptPublish(output, false)).rejects.toThrow("Fenced lease lost");
        expect(writes).toEqual([]);
    }
    const publish = () => recovery ? publishPlanReadyOutput(github, lease, async () => true, workerResult.runs[0],
        recovery, scope, f.composition.adapters.admission.trustedPublicKeyPem, plaintext) : createFencedPlaybookPr(github, lease, async () => true, proposal);
    // The file and proposed bytes are unchanged, but an advanced main fails before the first write.
    mainHead = "b".repeat(40);
    await expect(publish()).rejects.toThrow(/Playbook main advanced|RECOVERY_PUBLICATION_BASE/);
    expect(writes).toEqual([]);
    mainHead = publicationBase;
    await expect(publish()).rejects.toThrow("lost response");
    await expect(publish()).resolves.toMatchObject({number:1, branch:scope.branch, headSha:newHead, fileOperation:"modified"});
    expect(writes).toEqual(["POST /git/refs", "POST /graphql", "POST /pulls"]);
    expect(f.api.create).toHaveBeenCalledOnce();
    expect(f.checkpoints.commit).toHaveBeenCalledOnce();
    return workerResult;
}
