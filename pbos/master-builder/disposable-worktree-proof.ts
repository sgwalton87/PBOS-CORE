import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

const exec = promisify(execFile);
async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec("git", args, { cwd, timeout: 10_000, maxBuffer: 64 * 1024 });
  return result.stdout.trim();
}

/**
 * Runtime-attested disposable Git worktree, not caller-declared isolation.
 * An independently provisioned worktree must be checked before worker launch.
 */
export async function attestDisposableWorktree(
  path: string,
  repository: string,
  sourceSha: string,
): Promise<void> {
  if (!path || !repository || !/^[a-f0-9]{40}$/i.test(sourceSha)) {
    throw new Error("Invalid disposable worktree identity.");
  }
  const canonical = await realpath(path);
  if (canonical !== resolve(path) || canonical === "/") {
    throw new Error("Disposable worktree path must be canonical and non-root.");
  }
  const root = await git(canonical, "rev-parse", "--show-toplevel");
  const head = await git(canonical, "rev-parse", "HEAD");
  const gitDir = await git(canonical, "rev-parse", "--absolute-git-dir");
  const commonDir = await git(canonical, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (root !== canonical || head.toLowerCase() !== sourceSha.toLowerCase() ||
      gitDir === commonDir) {
    throw new Error("Disposable worktree is not a separate exact-revision Git worktree.");
  }
  const listed = await git(canonical, "worktree", "list", "--porcelain");
  if (!listed.split(/\n\n/).some(block =>
      block.split("\n").includes(`worktree ${canonical}`) &&
      block.split("\n").includes(`HEAD ${head}`))) {
    throw new Error("Disposable worktree is not registered at the requested revision.");
  }
  const remote = await git(canonical, "remote", "get-url", "origin");
  const normalized = remote.replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/");
  if (normalized !== `https://github.com/${repository}`) {
    throw new Error("Disposable worktree origin does not match mission repository.");
  }
  const status = await git(canonical, "status", "--porcelain", "--untracked-files=normal");
  if (status) throw new Error("Disposable worktree must be clean before worker launch.");
}
