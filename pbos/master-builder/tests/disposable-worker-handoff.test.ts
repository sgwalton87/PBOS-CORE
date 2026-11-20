import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { OperatorIdentityService } from "../../genesis-state/operator-identity";
import type { MasterBuilderMissionBinding } from "../mission-binding-gate";
import { disposableMissionApprovalScope } from "../signed-approval-evidence";
import { executeAuthorizedDisposableWorker } from "../disposable-worker-handoff";

describe("disposable existing Codex worker admission", () => {
  it("rejects unsigned, cross-mission, and nonisolated handoffs before calling the worker", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pbos-mb-worker-"));
    try {
      const source = join(dir, "source");
      execFileSync("git", ["init", "-q", source]);
      execFileSync("git", ["-C", source, "config", "user.email", "test@example.invalid"]);
      execFileSync("git", ["-C", source, "config", "user.name", "Disposable Test"]);
      writeFileSync(join(source, "README.md"), "Disposable test only\\n");
      execFileSync("git", ["-C", source, "add", "README.md"]);
      execFileSync("git", ["-C", source, "commit", "-qm", "Disposable fixture"]);
      execFileSync("git", ["-C", source, "remote", "add", "origin", "https://github.com/sgwalton87/playbook-platform.git"]);
      const sourceSha = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      const worktreePath = join(dir, "isolated-worktree");
      execFileSync("git", ["-C", source, "worktree", "add", "--detach", worktreePath, sourceSha]);
      const identities = new OperatorIdentityService(join(dir, "operators.json"));
      const { operator, credential } = identities.enroll("disposable-org", "Disposable operator");
      const actor = identities.authenticate(operator.operatorId, credential);
      const mission: MasterBuilderMissionBinding = {
        missionId: "048-phase-01", repository: "sgwalton87/playbook-platform",
        sourceSha, stateNamespace: "mb-disposable", environment: "DISPOSABLE",
      };
      const scope = disposableMissionApprovalScope(mission);
      const signed = identities.approve(actor, scope.action, scope.resource, 30);
      const request = {
        missionId: mission.missionId, title: "Disposable implementation", rationale: "Rehearsal",
        repository: mission.repository, revision: mission.sourceSha,
        workingDirectory: worktreePath, manifestPath: "pbos/readiness/048-phase-01.json",
      };
      const worktree = { path: request.workingDirectory, repository: mission.repository,
        sourceSha: mission.sourceSha, isolated: true, disposable: true };
      const execute = vi.fn(async () => ({ summary: "bounded worker result" }));
      const agent = { execute };
      await expect(executeAuthorizedDisposableWorker(agent, identities, null, mission,
        request, worktree, new Date())).rejects.toThrow(/signed approval/);
      await expect(executeAuthorizedDisposableWorker(agent, identities, signed,
        { ...mission, missionId: "another-mission" }, request, worktree, new Date()))
        .rejects.toThrow(/worktree/);
      await expect(executeAuthorizedDisposableWorker(agent, identities, signed, mission,
        request, { ...worktree, isolated: false }, new Date())).rejects.toThrow(/worktree/);
      expect(execute).not.toHaveBeenCalled();
      expect(await executeAuthorizedDisposableWorker(agent, identities, signed, mission,
        request, worktree, new Date())).toEqual({ summary: "bounded worker result" });
      expect(execute).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
