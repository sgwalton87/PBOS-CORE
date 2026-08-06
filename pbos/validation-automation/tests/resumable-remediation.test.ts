import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { CommandRunner } from "../../platform";
import { GitHubCheckCollector, RemediationHandler, ResumableRemediationEngine } from "../index";

class CheckCommands implements CommandRunner {
    passed = false;
    async run(command: string, args: readonly string[]) {
        if (command === "gh" && args[0] === "pr") return { stdout: JSON.stringify({ headRefOid: this.passed ? "fixed-sha" : "failed-sha" }), stderr: "" };
        if (command === "gh" && args[0] === "api") return { stdout: JSON.stringify({ check_runs: [{ name: "CI", status: "completed",
            conclusion: this.passed ? "success" : "failure", details_url: "https://github.com/acme/app/actions/runs/12" }] }), stderr: "" };
        return { stdout: "npm ci requires an existing package-lock.json", stderr: "" };
    }
}

class RepairHandler implements RemediationHandler {
    applied = 0;
    async propose() { return { summary: "add lock", files: [{ path: "package-lock.json", content: "{}" }] }; }
    async apply() { this.applied += 1; return "fixed-sha"; }
}

class SkippedCheckCommands implements CommandRunner {
    async run(_command: string, args: readonly string[]) {
        if (args[0] === "pr") return { stdout: JSON.stringify({ headRefOid: "abcdef1" }), stderr: "" };
        return { stdout: JSON.stringify({ check_runs: [{ name: "archive", status: "completed",
            conclusion: "skipped", details_url: "https://github.com/acme/app/actions/runs/12" }] }), stderr: "" };
    }
}

class MovingHeadCommands implements CommandRunner {
    headSha = "abcdef1";
    pending = false;
    async run(_command: string, args: readonly string[]) {
        if (args[0] === "pr") return { stdout: JSON.stringify({ headRefOid: this.headSha }), stderr: "" };
        return { stdout: JSON.stringify({ check_runs: [{ name: "CI", status: this.pending ? "in_progress" : "completed",
            conclusion: this.pending ? null : "success", details_url: "https://github.com/acme/app/actions/runs/13" }] }), stderr: "" };
    }
}

describe("resumable validation remediation", () => {
    it("persists failed evidence, applies remediation, and resumes to certification readiness", async () => {
        const statePath = join(mkdtempSync(join(tmpdir(), "pbos-remediation-")), "state.json");
        const state = new GenesisStateRepository(statePath);
        const commands = new CheckCommands();
        const handler = new RepairHandler();
        const engine = new ResumableRemediationEngine(state, new GitHubCheckCollector(commands), handler);
        const started = engine.start("SYSTEM-001", { repository: "acme/app", number: 1, branch: "agent/build", url: "https://github.com/acme/app/pull/1" });
        const repaired = await engine.resume(started.runId);
        expect(repaired.state).toBe("REMEDIATION_PUSHED");
        expect(new GenesisStateRepository(statePath).remediationRun(started.runId)?.state).toBe("REMEDIATION_PUSHED");
        commands.passed = true;
        const ready = await engine.resume(started.runId);
        expect(ready.state).toBe("READY_FOR_CERTIFICATION");
        expect(handler.applied).toBe(1);
    });

    it("blocks an identical failure instead of looping forever", async () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-remediation-")), "state.json"));
        const commands = new CheckCommands();
        const engine = new ResumableRemediationEngine(state, new GitHubCheckCollector(commands), new RepairHandler());
        const started = engine.start("SYSTEM-001", { repository: "acme/app", number: 1, branch: "agent/build", url: "https://github.com/acme/app/pull/1" });
        await engine.resume(started.runId);
        expect((await engine.resume(started.runId)).state).toBe("BLOCKED");
    });

    it("waits when GitHub has reported only skipped checks and reopens historical false-ready state", async () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-remediation-")), "state.json"));
        const engine = new ResumableRemediationEngine(state, new GitHubCheckCollector(new SkippedCheckCommands()), new RepairHandler());
        const started = engine.start("SYSTEM-001", { repository: "acme/app", number: 1, branch: "agent/build",
            url: "https://github.com/acme/app/pull/1" });
        state.saveRemediationRun({ ...started, headSha: "abcdef1", state: "READY_FOR_CERTIFICATION",
            evidence: [{ evidenceId: "skipped", name: "archive", state: "SKIPPED", collectedAt: new Date().toISOString() }] });
        const waiting = await engine.resume(started.runId);
        expect(waiting.state).toBe("WAITING_FOR_CHECKS");
        expect(waiting.blockers).toContain("GitHub reported only skipped checks; PBOS is waiting for an independent passing check.");
    });

    it("persists a blocker when remediation application fails", async () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-remediation-")), "state.json"));
        const commands = new CheckCommands();
        const handler: RemediationHandler = {
            async propose() { return { summary: "attempt repair", files: [{ path: "fix.ts", content: "export {};" }] }; },
            async apply() { throw new Error("repository produced no diff"); }
        };
        const engine = new ResumableRemediationEngine(state, new GitHubCheckCollector(commands), handler);
        const started = engine.start("SYSTEM-001", { repository: "acme/app", number: 1, branch: "agent/build", url: "https://github.com/acme/app/pull/1" });
        const blocked = await engine.resume(started.runId);
        expect(blocked.state).toBe("BLOCKED");
        expect(blocked.blockers).toContain("Remediation application failed: repository produced no diff");
        expect(state.remediationRun(started.runId)?.state).toBe("BLOCKED");
    });

    it("recollects a previously ready pull request and waits when its head advances", async () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-remediation-")), "state.json"));
        const commands = new MovingHeadCommands();
        const engine = new ResumableRemediationEngine(state, new GitHubCheckCollector(commands), new RepairHandler());
        const started = engine.start("SYSTEM-001", { repository: "acme/app", number: 1, branch: "agent/build",
            url: "https://github.com/acme/app/pull/1" });
        expect((await engine.resume(started.runId)).state).toBe("READY_FOR_CERTIFICATION");
        commands.headSha = "abcdef2"; commands.pending = true;
        const moved = await engine.resume(started.runId);
        expect(moved).toMatchObject({ headSha: "abcdef2", state: "WAITING_FOR_CHECKS" });
    });

    it("selects the newest pull request even when an older run was appended later", () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-remediation-")), "state.json"));
        const engine = new ResumableRemediationEngine(state, new GitHubCheckCollector(new CheckCommands()), new RepairHandler());
        const older = engine.start("SYSTEM-001", { repository: "acme/app", number: 49, branch: "agent/old",
            url: "https://github.com/acme/app/pull/49" });
        const newer = engine.start("SYSTEM-001", { repository: "acme/app", number: 50, branch: "agent/new",
            url: "https://github.com/acme/app/pull/50" });
        state.saveRemediationRun({ ...older, state: "BLOCKED", updatedAt: new Date(Date.now() + 1_000).toISOString() });
        expect(engine.latest("SYSTEM-001")?.runId).toBe(newer.runId);
    });
});
