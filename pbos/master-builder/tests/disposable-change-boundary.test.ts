import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectDisposableWorkerChanges } from "../disposable-change-boundary";

describe("MB-02 post-worker change scope", () => {
  it("accepts only scoped worktree changes and rejects unauthorized files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb02-change-"));
    try {
      const source = join(dir, "source");
      execFileSync("git", ["init", "-q", source]);
      execFileSync("git", ["-C", source, "config", "user.name", "Disposable"]);
      execFileSync("git", ["-C", source, "config", "user.email", "test@example.invalid"]);
      mkdirSync(join(source, "allowed"));
      writeFileSync(join(source, "allowed", "fixture.txt"), "base");
      execFileSync("git", ["-C", source, "add", "."]);
      execFileSync("git", ["-C", source, "commit", "-qm", "base"]);
      execFileSync("git", ["-C", source, "remote", "add", "origin",
        "https://github.com/sgwalton87/playbook-platform.git"]);
      const sha = execFileSync("git", ["-C", source, "rev-parse", "HEAD"],
        { encoding: "utf8" }).trim();
      const worktree = join(dir, "disposable");
      execFileSync("git", ["-C", source, "worktree", "add", "--detach", worktree, sha]);
      const check = () => inspectDisposableWorkerChanges(worktree,
        "sgwalton87/playbook-platform", sha, ["allowed"]);
      expect((await check()).accepted).toBe(false);
      writeFileSync(join(worktree, "allowed", "fixture.txt"), "changed");
      expect((await check()).accepted).toBe(true);
      writeFileSync(join(worktree, "outside.txt"), "unapproved");
      const rejected = await check();
      expect(rejected.accepted).toBe(false);
      expect(rejected.blockers.join(" ")).toContain("outside.txt");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
