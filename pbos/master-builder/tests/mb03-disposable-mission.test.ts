import { generateKeyPairSync, sign as ed25519Sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisStateRepository, verifyDisposableEvidence } from "../../genesis-state/genesis-state-repository";
import { OperatorIdentityService } from "../../genesis-state/operator-identity";
import { ProductionRuntimeService } from "../../production-runtime/production-runtime-service";
import { CodexCanonPhaseImplementationAgent } from "../../application-readiness/playbook-canon-phase-executor";
import { inspectMb03Recovery, mb03ApprovalScope, mb03QuarantineApprovalScope, quarantineMb03Attempt, runMb03DisposableMission } from "../mb03-disposable-mission";
import type { Mb03Mission } from "../mb03-disposable-mission";

import { evidenceDigest, evidenceJson, evidenceSignatureInput } from "../remote-attestation";
import { RemoteEvidenceArchive } from "../remote-evidence-archive";
import { REMOTE_PROVISION_DOMAIN, REMOTE_RETURN_DOMAIN, runTrustedRemoteMission } from "../trusted-remote-worker";
import type { RemoteFileOutput, RemoteWorkerBinding, TrustedRemoteWorkerProvider } from "../trusted-remote-worker";
import { GitHubDisposableProposalReader, INDEPENDENT_VERIFICATION_DOMAIN, independentlyVerifyDisposableMission } from "../independent-disposable-verifier";

import { runProvisionedCodexJob } from "../remote-codex-job";

const WORKFLOW = ".github/workflows/preflight.yml";
const WORKFLOW_TEXT = "name: Fixture CI\n";
const cleanup: string[] = [];
afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of cleanup.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function setup() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "mb03-authority-")));
    cleanup.push(root);
    const privateDir = (name: string) => {
        const path = join(root, name);
        mkdirSync(path, { mode: 0o700 });
        return path;
    };
    const repo = privateDir("checkout");
    const worktree = join(root, "worktree");
    const home = privateDir("worker-home");
    const codexHome = privateDir("worker-home/codex");
    const temporaryDirectory = privateDir("worker-temp");
    const statePath = join(privateDir("authority"), "state.json");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git("init");
    writeFileSync(join(repo, "allowed.txt"), "base\n");
    writeFileSync(join(repo, "outside.txt"), "untouched\n");
    mkdirSync(join(repo, ".github/workflows"), { recursive: true });
    writeFileSync(join(repo, WORKFLOW), WORKFLOW_TEXT);
    git("add", ".");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "Fixture");
    git("remote", "add", "origin", "https://github.com/fixture/pbos.git");
    git("worktree", "add", "--detach", worktree, "HEAD");
    const mission: Mb03Mission = {
        missionId: "fixture-mission", repository: "fixture/pbos", sourceSha: git("rev-parse", "HEAD"),
        stateNamespace: "fixture-state", environment: "DISPOSABLE", attemptId: "attempt-1", workerId: "worker-1",
        allowedPaths: ["allowed.txt"],
    };
    const state = GenesisStateRepository.createDisposable(statePath, mission.stateNamespace);
    const authorityId: string = JSON.parse(readFileSync(statePath, "utf8")).disposableAuthorityId;
    const identities = new OperatorIdentityService(join(root, "authority", "operators.json"));
    const enrolled = identities.enroll("fixture", "Fixture operator");
    const actor = identities.authenticate(enrolled.operator.operatorId, enrolled.credential);
    const sign = (binding = mission, duration = 10) => {
        const scope = mb03ApprovalScope(binding);
        return identities.approve(actor, scope.action, scope.resource, duration);
    };
    const signed = sign();
    const systemId = "fixture-system";
    const runtime = new ProductionRuntimeService(state);
    runtime.reconcileQueue(systemId, [{
        systemId, missionId: mission.missionId, title: "Fixture mission", rationale: "Fixture",
        status: "QUEUED", dependencies: [], approvalRequired: true, evidenceIds: [],
    }]);
    const request = {
        systemId, actorId: actor.operatorId, authorizationArtifactId: signed.approvalId, repository: mission.repository,
        branch: "disposable/fixture", commit: mission.sourceSha, approvedMissionIds: [mission.missionId],
        maximumMissions: 1, autonomousContinuation: false,
        buildChannel: { channelId: "channel", systemId, operatingSystemId: "os", connectorId: "connector",
            repository: mission.repository, domainRegistrationIds: ["domain"] },
    };
    return { mission, state, identities, signed, sign, actor, runtime, request, statePath, authorityId,
        context: { worktree, home, codexHome, temporaryDirectory }, root };
}

describe("MB-03 authoritative disposable execution", () => {
    it("admits just one contender across independent Node processes under the existing lease lock", async () => {
        const f = setup();
        const runner = `
            const { GenesisStateRepository } = require("./pbos/genesis-state/genesis-state-repository.ts");
            const { ProductionRuntimeService } = require("./pbos/production-runtime/production-runtime-service.ts");
            const input = JSON.parse(process.argv[1]);
            new ProductionRuntimeService(new GenesisStateRepository(input.path, input.attempt.namespace)).begin({
                ...input, disposableAttempt: input.attempt
            });`;
        const launch = (id: string) => promisify(execFile)(process.execPath, ["--import", "tsx", "-e", runner,
            JSON.stringify({ ...f.request, path: f.statePath, authorizationArtifactId: id, objective: "Fixture",
                mission: "Fixture mission", rationale: "Fixture", attempt: { missionId: f.mission.missionId,
                    namespace: f.mission.stateNamespace, attemptId: id, approvalDigest: "a".repeat(64), scopeDigest: "b".repeat(64) } })]);
        const outcomes = await Promise.allSettled([launch("attempt-a"), launch("attempt-b")]);
        expect(outcomes.filter(item => item.status === "fulfilled")).toHaveLength(1);
        expect(outcomes.find(item => item.status === "rejected")).toHaveProperty("reason.stderr", expect.stringMatching(/already (?:been claimed|owned)/));
        expect(f.state.productionRuns()).toHaveLength(1);
        expect(f.state.executionLeases()).toHaveLength(1);
    }, 15_000);

    it("fails closed before launch on signature tampering, expiry, revocation, revision drift and unsigned scope changes", async () => {
        const f = setup();
        const execute = vi.fn();
        const attempt = (mission = f.mission, approval = f.signed) => runMb03DisposableMission(
            f.state, f.identities, mission, approval,
            { ...f.request, authorizationArtifactId: approval.approvalId, commit: mission.sourceSha }, f.context, { execute });
        await expect(attempt(f.mission, { ...f.signed, signature: "0".repeat(64) })).rejects.toThrow(/invalid/);
        const expired = f.sign(f.mission, 0.00001);
        await new Promise(resolve => setTimeout(resolve, 5));
        await expect(attempt(f.mission, expired)).rejects.toThrow(/expired/);
        const revision = { ...f.mission, sourceSha: "c".repeat(40) };
        await expect(attempt(revision, f.sign(revision))).rejects.toThrow(/exact-revision/);
        await expect(attempt({ ...f.mission, allowedPaths: ["outside.txt"] })).rejects.toThrow(/invalid/);
        f.identities.revokeApproval(f.actor, f.signed);
        f.identities.enroll("fixture", "Another fixture operator");
        await expect(attempt()).rejects.toThrow(/revoked/);
        expect(execute).not.toHaveBeenCalled();
        expect(f.state.productionRuns()).toHaveLength(0);
    });

    it("checks revocation again immediately before dispatch", async () => {
        const f = setup();
        const execute = vi.fn();
        const verify = f.identities.verify.bind(f.identities);
        let checks = 0;
        vi.spyOn(f.identities, "verify").mockImplementation((approval, action, resource, at) => {
            if (++checks === 3) {
                // Separate service instance models revocation after preflight by the human issuer.
                const issuer = new OperatorIdentityService(join(f.root, "authority", "operators.json"));
                issuer.revokeApproval(f.actor, f.signed);
            }
            return verify(approval, action, resource, at);
        });
        await expect(runMb03DisposableMission(f.state, f.identities, f.mission, f.signed, f.request, f.context, { execute }))
            .rejects.toThrow(/revoked/);
        const [record] = f.state.productionRuns();
        expect(inspectMb03Recovery(f.state, record.runId).phase).toBe("DISPATCH_NOT_RECORDED");
        expect(execute).not.toHaveBeenCalled();
    });

    it("preserves an expired lease and rejects stale dispatch, renewal and legacy resume", () => {
        const f = setup();
        let now = new Date();
        const runtime = new ProductionRuntimeService(f.state, 1000, () => now);
        const [mission] = f.state.missionQueue(f.request.systemId);
        const pending = runtime.begin({
            ...f.request, objective: mission.title, mission: mission.title, rationale: mission.rationale,
            disposableAttempt: { missionId: f.mission.missionId, namespace: f.mission.stateNamespace,
                attemptId: f.mission.attemptId, approvalDigest: "a".repeat(64), scopeDigest: "b".repeat(64) },
        });
        runtime.transition(pending.runId, "QUEUED", "Fixture");
        runtime.transition(pending.runId, "STARTING", "Fixture");
        runtime.transition(pending.runId, "RUNNING", "Fixture");
        runtime.checkpointDisposableWorker(pending.runId, "started");
        expect(() => runtime.checkpointDisposableWorker(pending.runId, "started")).toThrow(/checkpoint/);
        now = new Date(now.getTime() + 1001);
        const before = readFileSync(f.statePath, "utf8");
        expect(inspectMb03Recovery(f.state, pending.runId, now)).toMatchObject({ phase: "DISPATCH_UNCERTAIN", lease: "EXPIRED" });
        expect(() => runtime.heartbeat(pending.runId)).toThrow(/expired/);
        expect(() => runtime.checkpointDisposableWorker(pending.runId, "finished")).toThrow(/checkpoint/);
        expect(runtime.recoverStaleRuns()).toEqual([]);
        expect(() => runtime.recoverFailedExecution(pending.runId, "fixture")).toThrow(/disposable/i);
        expect(readFileSync(f.statePath, "utf8")).toBe(before);
    });

    it("binds the existing Codex adapter to the one-file scope and persists only observed stage evidence", async () => {
        const f = setup();
        const run = vi.fn(async (args: readonly string[], worktree: string) => {
            expect(args.at(-1)).toContain("allowed.txt");
            expect(args.at(-1)).not.toContain("browserSpec");
            expect(args).toContain("sandbox_workspace_write.network_access=false");
            writeFileSync(join(worktree, "allowed.txt"), "fixture edit\n");
            return { stdout: "fixture receipt", stderr: "" };
        });
        const agent = new CodexCanonPhaseImplementationAgent({ run });
        await expect(runMb03DisposableMission(f.state, f.identities, f.mission, f.signed, f.request, f.context, agent))
            .rejects.toThrow(/Independent acceptance pending/);
        const [record] = f.state.productionRuns();
        const inspection = inspectMb03Recovery(f.state, record.runId);
        expect(inspection.phase).toBe("RETURN_OBSERVED");
        expect(inspection.evidence.map(item => item.stage)).toEqual(["SELECT", "PLAN", "BUILD"]);
        expect(inspection.evidence[2].payload.changedPaths).toEqual(["allowed.txt"]);
        expect(inspection.evidenceIntact).toBe(true);
        expect(verifyDisposableEvidence(inspection.evidence, true)).toBe(false);
        expect(verifyDisposableEvidence(inspection.evidence.slice(1))).toBe(false);
        expect(verifyDisposableEvidence(inspection.evidence.map(item => ({ ...item, sourceSha: "f".repeat(40) })))).toBe(false);
        expect(() => f.state.appendDisposableEvidence(record.runId, "PROPOSE", {})).toThrow(/out of order/);
        expect(() => f.state.appendDisposableEvidence(record.runId, "TEST", {})).toThrow(/invalid/i);
        writeFileSync(join(f.context.worktree, "allowed.txt"), "base\n");
        const retry = { ...f.mission, attemptId: "attempt-2" };
        const retryApproval = f.sign(retry);
        await expect(runMb03DisposableMission(f.state, f.identities, retry, retryApproval,
            { ...f.request, authorizationArtifactId: retryApproval.approvalId }, f.context, agent)).rejects.toThrow(/already been claimed/);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it.each(["outside", "rename", "symlink"])("rejects %s worker output without a BUILD receipt", async violation => {
        const f = setup();
        const execute = vi.fn(async () => {
            const allowed = join(f.context.worktree, "allowed.txt");
            writeFileSync(allowed, "edit\n");
            if (violation === "outside") writeFileSync(join(f.context.worktree, "outside.txt"), "unauthorized\n");
            if (violation === "rename") renameSync(allowed, join(f.context.worktree, "renamed.txt"));
            if (violation === "symlink") {
                rmSync(allowed);
                symlinkSync("outside.txt", allowed);
            }
            return { summary: "fixture return" };
        });
        await expect(runMb03DisposableMission(f.state, f.identities, f.mission, f.signed, f.request, f.context, { execute }))
            .rejects.toThrow();
        const [record] = f.state.productionRuns();
        expect(f.state.disposableEvidence(record.runId).map(item => item.stage)).toEqual(["SELECT", "PLAN"]);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it("preserves interrupted dispatch, requires distinct recovery approval, and never resumes the worker", async () => {
        const f = setup();
        const execute = vi.fn(async () => { throw new Error("fixture worker interrupted"); });
        await expect(runMb03DisposableMission(f.state, f.identities, f.mission, f.signed, f.request, f.context, { execute }))
            .rejects.toThrow(/return could not be verified/);
        const [record] = f.state.productionRuns();
        const before = readFileSync(f.statePath, "utf8");
        expect(inspectMb03Recovery(f.state, record.runId).phase).toBe("DISPATCH_UNCERTAIN");
        expect(f.runtime.recoverStaleRuns()).toEqual([]);
        expect(() => f.runtime.resume(record.runId, f.actor.operatorId)).toThrow(/disposable/i);
        expect(() => quarantineMb03Attempt(f.state, f.identities, f.mission, record.runId, f.signed)).toThrow(/distinct signed/);
        expect(readFileSync(f.statePath, "utf8")).toBe(before);
        const scope = mb03QuarantineApprovalScope(f.mission, record.runId);
        const recovery = f.identities.approve(f.actor, scope.action, scope.resource, 10);
        const prior = f.state.disposableEvidence(record.runId);
        quarantineMb03Attempt(f.state, f.identities, f.mission, record.runId, recovery);
        expect(inspectMb03Recovery(f.state, record.runId).phase).toBe("QUARANTINED");
        expect(f.state.disposableEvidence(record.runId)).toEqual(prior);
        expect(() => quarantineMb03Attempt(f.state, f.identities, f.mission, record.runId, recovery)).toThrow(/quarantined/);
        expect(execute).toHaveBeenCalledTimes(1);
    });
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(complete => { resolve = complete; });
    return { promise, resolve };
}

function signRemote<T>(domain: string, payload: T, key: KeyObject) {
    return { payload, signature: ed25519Sign(null, evidenceSignatureInput(domain, payload), key).toString("hex") };
}

function remoteFixture(f: ReturnType<typeof setup>) {
    const providerKeys = generateKeyPairSync("ed25519");
    const directory = join(f.root, "evidence");
    mkdirSync(directory, { mode: 0o700 });
    const worker = { providerId: "fixture-provider", publicKey: providerKeys.publicKey, authorityId: f.authorityId,
        isolationProfile: "a".repeat(64), timeoutMs: 3000, pollMs: 25, allowFixture: true,
        archive: new RemoteEvidenceArchive(directory, 90) };
    const bind = (binding: RemoteWorkerBinding) => evidenceDigest(evidenceJson(binding));
    function provision(binding: RemoteWorkerBinding, expiry = binding.deadline, credentialExpiry = expiry) {
        return signRemote(REMOTE_PROVISION_DOMAIN, { providerId: worker.providerId, bindingDigest: bind(binding),
            sandboxId: "sandbox-1", isolationProfile: worker.isolationProfile, issuedAt: new Date().toISOString(),
            expiresAt: expiry, credentialExpiresAt: credentialExpiry }, providerKeys.privateKey);
    }
    function returned(binding: RemoteWorkerBinding, files: readonly RemoteFileOutput[] = [
        { path: "allowed.txt", contentBase64: Buffer.from("remote fixture edit\n").toString("base64") }]) {
        const manifest = files.map(file => ({ path: file.path, digest: evidenceDigest(Buffer.from(file.contentBase64, "base64")) }));
        return { receipt: signRemote(REMOTE_RETURN_DOMAIN, { providerId: worker.providerId, bindingDigest: bind(binding),
            sandboxId: "sandbox-1", completedAt: new Date().toISOString(), status: "SUCCEEDED" as const,
            outputsDigest: evidenceDigest(evidenceJson(manifest)) }, providerKeys.privateKey), files };
    }
    const provider = {
        mode: "fixture" as const, provision: vi.fn(async (binding: RemoteWorkerBinding) => provision(binding)),
        execute: vi.fn(async (binding: RemoteWorkerBinding) => returned(binding)),
        dispose: vi.fn(async () => undefined),
    };
    const run = (adapter: TrustedRemoteWorkerProvider = provider, trust = worker, state = f.state) =>
        runTrustedRemoteMission(state, f.identities, f.mission, f.signed, f.request, f.context, adapter, trust);
    return { provider, worker, provision, returned, run, directory };
}

describe("MB-03.1 trusted provider and independent verifier fixtures", () => {
    it("requires a pinned available authority and explicit fixture opt-in before dispatch", async () => {
        const f = setup();
        const r = remoteFixture(f);
        await expect(r.run(r.provider, { ...r.worker, allowFixture: false })).rejects.toThrow(/provider deployment/);
        const copy = GenesisStateRepository.createDisposable(join(f.root, "authority", "other.json"), f.mission.stateNamespace);
        await expect(r.run(r.provider, r.worker, copy)).rejects.toThrow(/does not match/);
        const copiedState = join(f.root, "authority", "snapshot.json");
        writeFileSync(copiedState, readFileSync(f.statePath), { mode: 0o600 });
        expect(() => new GenesisStateRepository(copiedState, f.mission.stateNamespace)).toThrow(/inconsistent/);
        renameSync(f.statePath, f.statePath + ".offline");
        await expect(r.run()).rejects.toThrow();
        expect(r.provider.provision).not.toHaveBeenCalled();
    });

    it.each(["forged", "expired", "expired-credential", "wrong-worker", "wrong-repository", "wrong-sha"])(
        "rejects %s provisioning before the adapter executes", async variant => {
            const f = setup();
            const r = remoteFixture(f);
            r.provider.provision.mockImplementation(async binding => {
                switch (variant) {
                    case "forged": return { ...r.provision(binding), signature: "0".repeat(128) };
                    case "expired": return r.provision(binding, new Date(Date.now() - 1000).toISOString());
                    case "expired-credential": return r.provision(binding, binding.deadline, new Date(Date.now() - 1000).toISOString());
                    case "wrong-worker": return r.provision({ ...binding, mission: { ...binding.mission, workerId: "other-worker" } });
                    case "wrong-repository": return r.provision({ ...binding, mission: { ...binding.mission, repository: "other/repo" } });
                    default: return r.provision({ ...binding, mission: { ...binding.mission, sourceSha: "f".repeat(40) } });
                }
            });
            await expect(r.run()).rejects.toThrow(/return could not be verified/);
            expect(r.provider.execute).not.toHaveBeenCalled();
            expect(r.provider.dispose).toHaveBeenCalledTimes(1);
            const [run] = f.state.productionRuns();
            expect(f.state.disposableEvidence(run.runId).map(item => item.stage)).toEqual(["SELECT", "PLAN"]);
        });

    it.each(["revocation", "timeout", "lease-loss", "partition"])("cancels a live %s and fences a late return", async events => {
        const f = setup();
        const r = remoteFixture(f);
        const providerStarted = deferred<void>();
        const providerReturn = deferred<ReturnType<typeof r.returned>>();
        let binding: RemoteWorkerBinding | undefined;
        let workerSignal: AbortSignal | undefined;
        const adapter = { ...r.provider,
            execute: vi.fn(async (reserved: RemoteWorkerBinding, _work: unknown, signal: AbortSignal) => {
                binding = reserved;
                workerSignal = signal;
                providerStarted.resolve();
                return providerReturn.promise;
            }),
        };
        const result = r.run(adapter, { ...r.worker, timeoutMs: events === "timeout" ? 250 : 3000 })
            .then(() => "unexpected completion", error => String(error));
        await providerStarted.promise;
        const live = new GenesisStateRepository(f.statePath, f.mission.stateNamespace);
        if (events !== "timeout") await expect(r.run(r.provider, r.worker, live)).rejects.toThrow(/already been claimed/);
        if (events === "revocation") f.identities.revokeApproval(f.actor, f.signed);
        if (events === "partition") renameSync(f.statePath, f.statePath + ".offline");
        if (events === "lease-loss") {
            const [lease] = f.state.executionLeases();
            f.state.saveExecutionLease({ ...lease, status: "STALE" });
        }
        expect(await result).toMatch(/timed out|lost lease|ENOENT/);
        if (events === "partition") renameSync(f.statePath + ".offline", f.statePath);
        expect(workerSignal?.aborted).toBe(true);
        expect(r.provider.dispose).toHaveBeenCalledTimes(1);
        providerReturn.resolve(r.returned(binding!));
        await new Promise(resolve => setImmediate(resolve));
        const [record] = f.state.productionRuns();
        expect(f.state.disposableEvidence(record.runId).map(item => item.stage)).toEqual(["SELECT", "PLAN"]);
        expect(readFileSync(join(f.context.worktree, "allowed.txt"), "utf8")).toBe("base\n");
        await expect(r.run(r.provider, r.worker, new GenesisStateRepository(f.statePath, f.mission.stateNamespace))).rejects.toThrow();
        expect(adapter.execute).toHaveBeenCalledTimes(1);
    });

    it.each(["traversal", "conflicting-output", "conflicting-sandbox"])("rejects %s returns before materializing changes", async problem => {
        const f = setup();
        const r = remoteFixture(f);
        r.provider.execute.mockImplementation(async binding => {
            const result = r.returned(binding);
            if (problem === "traversal") return r.returned(binding, [{ ...result.files[0], path: "../outside.txt" }]);
            if (problem === "conflicting-output") return { ...result, files: [{
                ...result.files[0], contentBase64: Buffer.from("different edit\n").toString("base64"),
            }] };
            return r.returned({ ...binding, fence: "another-lease" });
        });
        await expect(r.run()).rejects.toThrow(/return could not be verified/);
        const [record] = f.state.productionRuns();
        expect(f.state.disposableEvidence(record.runId)).toHaveLength(2);
        expect(readFileSync(join(f.context.worktree, "allowed.txt"), "utf8")).toBe("base\n");
    });

    it("rejects an otherwise signed return when provider disposal cannot be confirmed", async () => {
        const f = setup();
        const r = remoteFixture(f);
        r.provider.dispose.mockRejectedValue(new Error("Fixture teardown unavailable"));
        await expect(r.run()).rejects.toThrow(/return could not be verified/);
        const [record] = f.state.productionRuns();
        expect(f.state.disposableEvidence(record.runId)).toHaveLength(2);
        expect(readFileSync(join(f.context.worktree, "allowed.txt"), "utf8")).toBe("base\n");
    });

    it("completes seven fixture stages only after distinct signed tests, actual artifacts and confirmed exact-head draft CI", async () => {
        const f = setup();
        const r = remoteFixture(f);
        const providerWorktree = join(f.root, "provider-worktree");
        execFileSync("git", ["worktree", "add", "--detach", providerWorktree, f.mission.sourceSha],
            { cwd: f.context.worktree, stdio: "ignore" });
        const codex = new CodexCanonPhaseImplementationAgent({ async run(args, worktree, _report, _timeout, signal) {
            expect(args.at(-1)).toContain("allowed.txt");
            expect(signal?.aborted).toBe(false);
            writeFileSync(join(worktree, "allowed.txt"), "provider job edit\n");
            return { stdout: "Fixture worker completed", stderr: "" };
        } });
        const provider = { ...r.provider, async execute(binding: RemoteWorkerBinding,
            work: Readonly<{ title: string; rationale: string }>, signal: AbortSignal) {
            return r.returned(binding, await runProvisionedCodexJob(binding, work, { ...f.context, worktree: providerWorktree },
                signal, codex));
        } };
        await expect(r.run(provider)).rejects.toThrow(/Independent acceptance pending/);
        expect(readFileSync(join(f.context.worktree, "allowed.txt"), "utf8")).toBe("provider job edit\n");
        const [run] = f.state.productionRuns();
        const build = f.state.disposableEvidence(run.runId).at(-1)!;
        expect(build.stage).toBe("BUILD");
        expect(build.payload.source).toBe("provider-attested-return");
        expect(() => f.state.appendDisposableEvidence(run.runId, "TEST", { diffDigest: build.payload.diffDigest,
            testResultsDigest: "c".repeat(64) })).toThrow(/independent verifier/);
        const git = (...args: string[]) => execFileSync("git", args, { cwd: f.context.worktree, encoding: "utf8" }).trim();
        git("add", "allowed.txt");
        git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "Fixture proposal");
        const proposalSha = git("rev-parse", "HEAD");
        const checkout = join(f.root, "verifier-checkout");
        git("worktree", "add", "--detach", checkout, proposalSha);
        const verifierKeys = generateKeyPairSync("ed25519");
        const verifierId = "independent-fixture";
        const artifacts = { checkout, verification: Buffer.from("Verified fixture scope"), documentation: Buffer.from("Fixture report"),
            testLogs: new Map([["fixture-suite", Buffer.from("Fixture passed")]]) };
        const statement = {
            runId: run.runId, proposalSha, verifierId, buildDigest: build.digest, diffDigest: build.payload.diffDigest as string,
            verificationDigest: evidenceDigest(artifacts.verification), documentationDigest: evidenceDigest(artifacts.documentation),
            testResults: [{ check: "fixture-suite", exitCode: 0, logDigest: evidenceDigest(artifacts.testLogs.get("fixture-suite")!) }],
        };
        const signed = signRemote(INDEPENDENT_VERIFICATION_DOMAIN, statement, verifierKeys.privateKey);
        const trust = { worker: r.worker, verifierId, verifierPublicKey: verifierKeys.publicKey, requiredTests: ["fixture-suite"],
            github: { baseRef: "fixture", workflowId: 44, jobName: "Fixture CI", workflowPath: WORKFLOW,
                workflowDigest: evidenceDigest(WORKFLOW_TEXT) } };
        const proposal = { number: 10, ciRunId: 88 };
        let reportedHead = "f".repeat(40);
        const repository = { full_name: f.mission.repository };
        const github = new GitHubDisposableProposalReader({ async run(_bin, args) {
            const endpoint = args.at(-1);
            const response = endpoint?.endsWith("/attempts/1/jobs") ? { jobs: [
                { name: "Fixture CI", status: "completed", conclusion: "success" }] } :
                endpoint?.endsWith("/runs/88") ? { id: 88, workflow_id: 44, path: WORKFLOW, run_attempt: 1,
                    head_sha: reportedHead, repository, event: "workflow_dispatch", status: "completed", conclusion: "success" } :
                    { number: 10, html_url: "https://github.com/fixture/pbos/pull/10", draft: true, state: "open",
                        head: { sha: proposalSha, repo: repository }, base: { sha: f.mission.sourceSha, ref: "fixture", repo: repository } };
            return { stdout: JSON.stringify(response), stderr: "" };
        } });
        const verify = (evidence = signed, inputs = artifacts, policy = trust) =>
            independentlyVerifyDisposableMission(f.state, f.identities, f.signed, run.runId, evidence, inputs, proposal, policy, github);
        await expect(verify({ ...signed, signature: "0".repeat(128) })).rejects.toThrow(/signature/);
        await expect(verify(signed, { ...artifacts, documentation: Buffer.from("Modified") })).rejects.toThrow(/artifact/);
        await expect(verify(signed, artifacts, { ...trust, verifierPublicKey: r.worker.publicKey })).rejects.toThrow(/distinct/);
        await expect(verify()).rejects.toThrow(/exact-head/);
        expect(f.state.disposableEvidence(run.runId)).toHaveLength(3);
        reportedHead = proposalSha;
        const independent = await verify();
        expect(independent.mode).toBe("fixture");
        expect(verifyDisposableEvidence(independent.records, true)).toBe(true);
        expect(independent.records.map(record => record.stage)).toEqual(["SELECT", "PLAN", "BUILD", "TEST", "VERIFY", "DOCUMENT", "PROPOSE"]);
        const archived = join(r.directory, independent.archiveDigest);
        expect(r.worker.archive.read(independent.archiveDigest)).toMatchObject({ mode: "fixture" });
        writeFileSync(archived, "tamper");
        expect(() => r.worker.archive.read(independent.archiveDigest)).toThrow(/digest mismatch/);
        await expect(verify()).rejects.toThrow(/incomplete/);
    }, 15_000);
});
