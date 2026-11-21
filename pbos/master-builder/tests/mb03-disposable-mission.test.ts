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
    return { mission, state, identities, signed, sign, actor, runtime, request, statePath,
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
