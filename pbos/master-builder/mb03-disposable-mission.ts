import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative } from "node:path";
import { promisify } from "node:util";
import type { CanonPhaseImplementationAgent } from "../application-readiness/playbook-canon-phase-executor";
import { GenesisStateRepository, OperatorIdentityService } from "../genesis-state";
import { verifyDisposableEvidence } from "../genesis-state/genesis-state-repository";
import type { VerifiableApproval } from "../genesis-state/operator-identity";
import { ProductionMissionRunner, type ProductionMissionRequest } from "../production-runtime/production-mission-runner";
import { ProductionRuntimeService } from "../production-runtime/production-runtime-service";
import { attestExactDisposableFiles, inspectDisposableWorkerChanges, isExactDisposableFile } from "./disposable-change-boundary";
import { attestDisposableWorktree } from "./disposable-worktree-proof";
import type { MasterBuilderMissionBinding } from "./mission-binding-gate";
import { disposableMissionApprovalScope, inspectSignedMissionApproval } from "./signed-approval-evidence";

const exec = promisify(execFile);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export type Mb03Mission = MasterBuilderMissionBinding & Readonly<{
    attemptId: string;
    workerId: string;
    allowedPaths: readonly string[];
}>;

export type DisposableCodexContext = Readonly<{
    worktree: string;
    home: string;
    codexHome: string;
    temporaryDirectory: string;
}>;

export function mb03ApprovalScope(mission: Mb03Mission) {
    const binding = disposableMissionApprovalScope(mission);
    if (!/^[A-Za-z0-9._-]+$/.test(mission.attemptId) || !/^[A-Za-z0-9._-]+$/.test(mission.workerId) ||
        !Array.isArray(mission.allowedPaths) || !mission.allowedPaths.length ||
        new Set(mission.allowedPaths).size !== mission.allowedPaths.length || !mission.allowedPaths.every(isExactDisposableFile)) {
        throw new Error("Invalid MB-03 attempted worker or exact signed file scope.");
    }
    return { action: binding.action, resource: JSON.stringify([
        "MB-03", JSON.parse(binding.resource), mission.attemptId, mission.workerId, [...mission.allowedPaths].sort(),
    ]) };
}

function inside(root: string, path: string): boolean {
    const tail = relative(root, path);
    return tail === "" || (!isAbsolute(tail) && tail !== ".." && !tail.startsWith("../"));
}

async function attestDirectories(context: DisposableCodexContext): Promise<void> {
    const { home, codexHome, temporaryDirectory, worktree } = context;
    const hostHome = await realpath(homedir());
    for (const directory of [home, codexHome, temporaryDirectory]) {
        const metadata = await lstat(directory);
        if (await realpath(directory) !== directory || !metadata.isDirectory() || (metadata.mode & 0o077) !== 0 ||
            inside(hostHome, directory) || inside(directory, hostHome) ||
            inside(worktree, directory) || inside(directory, worktree)) {
            throw new Error("Worker paths must be private, canonical and separate from the host home and checkout.");
        }
    }
    if (home === codexHome || !inside(home, codexHome) || inside(home, temporaryDirectory) || inside(temporaryDirectory, home)) {
        throw new Error("Codex authentication and scratch paths must be isolated.");
    }
}

async function assertTrackedOnly(worktree: string): Promise<void> {
    const { stdout } = await exec("git", ["status", "--porcelain", "--ignored", "--untracked-files=all"],
        { cwd: worktree, timeout: 10_000, maxBuffer: 1024 * 1024 });
    if (stdout.length) throw new Error("Disposable worker checkout contains untracked, ignored, or modified files.");
}

/** Trusted control-plane adapter. The injected worker is a test seam; a remote launcher and trust root are separate. */
export async function runMb03DisposableMission(state: GenesisStateRepository, identities: OperatorIdentityService,
    original: Mb03Mission, approval: VerifiableApproval, originalRequest: ProductionMissionRequest, originalContext: DisposableCodexContext,
    agent: CanonPhaseImplementationAgent) {
    if (!agent) throw new Error("A trusted, isolated implementation adapter must be provided.");
    const mission = { ...original, allowedPaths: [...original.allowedPaths].sort() };
    const context = { ...originalContext };
    const signed = { ...approval };
    const scope = mb03ApprovalScope(mission);
    const request = { ...originalRequest, approvedMissionIds: [...(originalRequest.approvedMissionIds ?? [])],
        buildChannel: { ...originalRequest.buildChannel,
            domainRegistrationIds: [...originalRequest.buildChannel.domainRegistrationIds] } };
    const verify = () => {
        if (!inspectSignedMissionApproval(identities, signed, { mission, ...scope }, new Date())) {
            throw new Error("MB-03 signed approval is invalid, expired or revoked.");
        }
    };
    if (mission.sourceSha !== mission.sourceSha.toLowerCase() || request.repository !== mission.repository || request.commit !== mission.sourceSha ||
        request.actorId !== signed.operatorId || request.authorizationArtifactId !== signed.approvalId ||
        request.maximumMissions !== 1 || request.autonomousContinuation !== false ||
        request.approvedMissionIds?.length !== 1 || request.approvedMissionIds[0] !== mission.missionId ||
        request.triggerSource === "CONTINUATION" || !/^disposable\/[A-Za-z0-9._/-]+$/.test(request.branch)) {
        throw new Error("MB-03 runner request does not match signed mission scope.");
    }
    state.assertDisposableNamespace(mission.stateNamespace);
    verify();
    await attestDisposableWorktree(context.worktree, mission.repository, mission.sourceSha);
    await attestExactDisposableFiles(context.worktree, mission.allowedPaths);
    await attestDirectories(context);
    await assertTrackedOnly(context.worktree);
    verify();

    const runtime = new ProductionRuntimeService(state);
    const runner = new ProductionMissionRunner(state, runtime);
    const attempt = { missionId: mission.missionId, namespace: mission.stateNamespace, attemptId: mission.attemptId,
        approvalDigest: digest(signed.signature), scopeDigest: digest(scope.resource) };
    return runner.run({ ...request, disposableAttempt: attempt }, candidate =>
        candidate.missionId === mission.missionId ? async ({ run }) => {
            if (!run.executionPlan) throw new Error("Disposable execution plan is missing.");
            state.appendDisposableEvidence(run.runId, "SELECT", { missionId: candidate.missionId, workerId: mission.workerId });
            state.appendDisposableEvidence(run.runId, "PLAN", {
                planHash: digest(JSON.stringify(run.executionPlan)), allowedPaths: mission.allowedPaths,
            });
            await attestDisposableWorktree(context.worktree, mission.repository, mission.sourceSha);
            await attestExactDisposableFiles(context.worktree, mission.allowedPaths);
            await attestDirectories(context);
            await assertTrackedOnly(context.worktree);
            verify();
            runtime.checkpointDisposableWorker(run.runId, "started");
            let leaseFailure = false;
            const heartbeat = setInterval(() => {
                try { runtime.heartbeat(run.runId); }
                catch { leaseFailure = true; }
            }, 5000);
            try {
                const response = await agent.execute({
                    missionId: mission.missionId, title: candidate.title, rationale: candidate.rationale,
                    repository: mission.repository, revision: mission.sourceSha, workingDirectory: context.worktree,
                    manifestPath: "", disposableCore: { ...context, allowedPaths: mission.allowedPaths },
                }).catch(() => { throw new Error("Disposable worker return could not be verified."); });
                if (leaseFailure) throw new Error("Disposable worker lost its lease before verification.");
                runtime.checkpointDisposableWorker(run.runId, "finished");
                verify();
                await attestExactDisposableFiles(context.worktree, mission.allowedPaths);
                const diff = await inspectDisposableWorkerChanges(context.worktree, mission.repository,
                    mission.sourceSha, mission.allowedPaths, true);
                if (!diff.accepted) throw new Error("Disposable worker output exceeded its exact file scope.");
                const { stdout } = await exec("git", ["diff", "--no-ext-diff", "--no-textconv", "--binary", "HEAD"], {
                    cwd: context.worktree, timeout: 10_000, maxBuffer: 4 * 1024 * 1024,
                });
                const receipt = state.appendDisposableEvidence(run.runId, "BUILD", {
                    workerId: mission.workerId, diffDigest: digest(stdout), changedPaths: diff.changedPaths,
                    outputDigest: digest(response.summary), source: "bounded-adapter-return",
                });
                // Exact-revision tests and independent verification belong to a separate verifier.
                // Preserve the observed receipt without claiming acceptance or publishing a proposal.
                return { outputs: { revision: mission.sourceSha }, files: { modified: diff.changedPaths },
                    evidenceIds: [receipt.digest], validations: [{ name: "Independent acceptance pending",
                        passed: false, durationMs: 0, evidenceId: receipt.digest }] };
            } finally { clearInterval(heartbeat); }
        } : undefined);
}

/** Inspect a single state snapshot. Missing or expired leases convey no permission to start another worker. */
export function inspectMb03Recovery(state: GenesisStateRepository, runId: string, at = new Date()) {
    const { run, activeLease, evidence } = state.inspectDisposableRun(runId);
    const attempt = run.disposableAttempt!;
    const phase = attempt.quarantine ? "QUARANTINED" : attempt.workerFinishedAt ? "RETURN_OBSERVED" :
        attempt.workerStartedAt ? "DISPATCH_UNCERTAIN" : "DISPATCH_NOT_RECORDED";
    const expiresAt = Date.parse(activeLease?.expiresAt ?? "");
    return {
        phase,
        lease: !activeLease ? "NONE" : !Number.isFinite(expiresAt) ? "INVALID" :
            expiresAt > at.getTime() ? "ACTIVE" : "EXPIRED",
        run,
        evidence,
        evidenceIntact: evidence.every(record => record.attemptId === attempt.attemptId &&
            record.approvalDigest === attempt.approvalDigest && record.sourceSha === run.startingCommit) &&
            verifyDisposableEvidence(evidence),
    } as const;
}

export function mb03QuarantineApprovalScope(mission: Mb03Mission, runId: string) {
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error("Invalid disposable recovery run ID.");
    return { action: "master-builder:quarantine-disposable-attempt",
        resource: JSON.stringify([JSON.parse(mb03ApprovalScope(mission).resource), runId]) };
}

/** Preserve the original lease, dispatch checkpoints and evidence. Quarantine never dispatches a worker. */
export function quarantineMb03Attempt(state: GenesisStateRepository, identities: OperatorIdentityService,
    mission: Mb03Mission, runId: string, approval: VerifiableApproval): void {
    state.assertDisposableNamespace(mission.stateNamespace);
    const scope = mb03QuarantineApprovalScope(mission, runId);
    const { run } = state.inspectDisposableRun(runId);
    const attempt = run.disposableAttempt!;
    if (attempt.attemptId !== mission.attemptId || attempt.missionId !== mission.missionId ||
        run.startingCommit !== mission.sourceSha || run.repository !== mission.repository ||
        attempt.scopeDigest !== digest(mb03ApprovalScope(mission).resource)) {
        throw new Error("Recovery scope does not match the persisted attempt.");
    }
    const now = new Date();
    if (!inspectSignedMissionApproval(identities, approval, { mission, ...scope }, now)) {
        throw new Error("A distinct signed quarantine approval is required.");
    }
    state.quarantineDisposableRun(runId, mission.attemptId, approval.operatorId, digest(approval.signature), now);
}
