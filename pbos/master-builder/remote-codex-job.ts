import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { CodexCanonPhaseImplementationAgent } from "../application-readiness/playbook-canon-phase-executor";
import type { CanonPhaseImplementationAgent } from "../application-readiness/playbook-canon-phase-executor";
import { attestExactDisposableFiles, inspectDisposableWorkerChanges } from "./disposable-change-boundary";
import { attestDisposableWorktree } from "./disposable-worktree-proof";
import { assertCleanDisposableWorkerFiles, attestDisposableWorkerDirectories, mb03ApprovalScope } from "./mb03-disposable-mission";
import type { DisposableCodexContext } from "./mb03-disposable-mission";
import type { RemoteFileOutput, RemoteWorkerBinding } from "./trusted-remote-worker";
import { MAX_REMOTE_FILE_BYTES, MAX_REMOTE_TTL_MS } from "./trusted-remote-worker";

/** Job entry for an already-authorized provider sandbox. The provider must enforce isolation, authentication and teardown. */
export async function runProvisionedCodexJob(binding: RemoteWorkerBinding, work: Readonly<{ title: string; rationale: string }>,
    paths: DisposableCodexContext, providerSignal: AbortSignal,
    agent: CanonPhaseImplementationAgent = new CodexCanonPhaseImplementationAgent()): Promise<readonly RemoteFileOutput[]> {
    const mission = binding.mission;
    mb03ApprovalScope(mission);
    const remaining = Date.parse(binding.deadline) - Date.now();
    if (!(remaining > 0 && remaining <= MAX_REMOTE_TTL_MS)) throw new Error("Remote Codex job deadline is invalid.");
    const signal = AbortSignal.any([providerSignal, AbortSignal.timeout(remaining)]);
    const assertLive = () => {
        signal.throwIfAborted();
        if (Date.now() >= Date.parse(binding.deadline)) throw new Error("Remote Codex job deadline elapsed.");
    };
    assertLive();
    await attestDisposableWorktree(paths.worktree, mission.repository, mission.sourceSha);
    await attestExactDisposableFiles(paths.worktree, mission.allowedPaths);
    await attestDisposableWorkerDirectories(paths);
    await assertCleanDisposableWorkerFiles(paths.worktree);
    assertLive();
    await agent.execute({
        missionId: mission.missionId, title: work.title, rationale: work.rationale,
        repository: mission.repository, revision: mission.sourceSha, workingDirectory: paths.worktree, manifestPath: "",
        disposableCore: { ...paths, allowedPaths: mission.allowedPaths }, signal,
    });
    assertLive();
    await attestExactDisposableFiles(paths.worktree, mission.allowedPaths);
    const inspection = await inspectDisposableWorkerChanges(paths.worktree, mission.repository, mission.sourceSha, mission.allowedPaths, true);
    if (!inspection.accepted) throw new Error("Remote Codex output did not satisfy the signed change scope.");
    const outputs: RemoteFileOutput[] = [];
    for (const path of inspection.changedPaths) {
        assertLive();
        const file = await open(join(paths.worktree, path), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const info = await file.stat();
            if (!info.isFile() || info.nlink !== 1 || info.size > MAX_REMOTE_FILE_BYTES) {
                throw new Error("Remote Codex output must be a bounded regular file.");
            }
            const bytes = await file.readFile();
            if (bytes.length > MAX_REMOTE_FILE_BYTES) throw new Error("Remote Codex output exceeded file budget.");
            outputs.push({ path, contentBase64: bytes.toString("base64") });
        } finally { await file.close(); }
    }
    assertLive();
    return outputs;
}
