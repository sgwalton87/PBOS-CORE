import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

const exec = promisify(execFile);
export type DisposableChangeInspection = Readonly<{
  accepted: boolean;
  changedPaths: readonly string[];
  blockers: readonly string[];
}>;

/**
 * After Codex exits, check its changed paths against an explicit mission allowlist.
 * This check does not stage, commit, push or grant execution authority.
 */
export async function inspectDisposableWorkerChanges(
  worktreePath: string,
  repository: string,
  sourceSha: string,
  allowedPaths: readonly string[],
): Promise<DisposableChangeInspection> {
  const blockers: string[] = [];
  if (!/^[a-f0-9]{40}$/i.test(sourceSha) ||
      !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repository)) {
    return { accepted: false, changedPaths: [], blockers: ["Invalid repository or source revision."] };
  }
  const canonical = await realpath(worktreePath);
  if (canonical !== resolve(worktreePath) || !allowedPaths.length ||
      allowedPaths.some(path => !path || path.startsWith("/") ||
        path.includes("\\") || path.split("/").some(segment =>
          segment === "." || segment === ".." || segment === ""))) {
    return { accepted: false, changedPaths: [], blockers: ["Invalid worktree or allowed path scope."] };
  }
  // Post-execution worktrees are intentionally dirty, so re-attest immutable
  // identity directly instead of calling the clean pre-execution attestation.
  const git = async (...args: string[]) => (await exec("git", args,
    { cwd: canonical, timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout.trim();
  const [root, head, gitDir, commonDir, remote] = await Promise.all([
    git("rev-parse", "--show-toplevel"), git("rev-parse", "HEAD"),
    git("rev-parse", "--absolute-git-dir"),
    git("rev-parse", "--path-format=absolute", "--git-common-dir"),
    git("remote", "get-url", "origin"),
  ]);
  const normalizedRemote = remote.replace(/[.]git$/, "").replace(/^git@github[.]com:/, "https://github.com/");
  if (root !== canonical || head.toLowerCase() !== sourceSha.toLowerCase() ||
      gitDir === commonDir || normalizedRemote !== `https://github.com/${repository}`) {
    blockers.push("Post-worker repository identity or revision changed.");
  }
  // Preserve leading status columns and NUL delimiters; trim() corrupts porcelain records.
  const porcelain = (await exec("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd: canonical, timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout;
  const entries = porcelain.split("\0").filter(Boolean);
  const changedPaths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 4) { blockers.push("Malformed Git status entry."); continue; }
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    changedPaths.push(path);
    if (code.includes("R") || code.includes("C")) {
      const originalPath = entries[++i];
      if (originalPath) changedPaths.push(originalPath);
      else blockers.push("Malformed rename/copy status entry.");
    }
    const recordPaths = code.includes("R") || code.includes("C")
      ? changedPaths.slice(-2) : [path];
    if (code.includes("!") || code.includes("U") ||
        recordPaths.some(changed =>
          !allowedPaths.some(allowed => changed === allowed || changed.startsWith(`${allowed}/`)))) {
      blockers.push(`Out-of-scope or conflicted change: ${path}`);
    }
  }
  if (!changedPaths.length) blockers.push("Worker produced no reviewable changes.");
  return { accepted: blockers.length === 0, changedPaths, blockers };
}
