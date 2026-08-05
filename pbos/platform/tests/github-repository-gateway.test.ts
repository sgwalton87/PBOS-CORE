import { mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { CommandRunner, GitHubRepositoryGateway } from "../github-repository-gateway";

class FakeCommands implements CommandRunner {
    readonly calls: { command: string; args: readonly string[]; cwd?: string }[] = [];
    async run(command: string, args: readonly string[], cwd?: string) {
        this.calls.push({ command, args, cwd });
        if (args[0] === "rev-parse" && args[1] === "--git-dir") return { stdout: ".git\n", stderr: "" };
        if (args[0] === "rev-parse") return { stdout: "abc123\n", stderr: "" };
        if (args[0] === "ls-tree") return { stdout: ["README.md", "package.json", "package-lock.json", "src/index.ts",
            "pbos/generated/capabilities/analytics.json", "pbos/generated/capabilities/analytics.ts",
            "pbos/generated/capabilities/analytics.test.ts"].join("\n"), stderr: "" };
        if (command === "gh") return { stdout: "https://github.com/acme/app/pull/7\n", stderr: "" };
        return { stdout: "", stderr: "" };
    }
}

describe("GitHub repository gateway", () => {
    const reference = { owner: "acme", name: "app", defaultBranch: "main" };
    it("inspects and uses argv-safe git commands", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-gateway-"));
        mkdirSync(join(root, "acme--app"));
        const commands = new FakeCommands();
        const inspection = await new GitHubRepositoryGateway(root, commands).inspectRepository(reference);
        expect(inspection.revision).toBe("abc123");
        expect(commands.calls).toContainEqual(expect.objectContaining({ command: "git", args: ["fetch", "origin", "main"] }));
        expect(commands.calls).toContainEqual(expect.objectContaining({ command: "git", args: ["rev-parse", "origin/main"] }));
        expect(commands.calls.some(call => call.command === "git" && call.args[0] === "ls-tree" && call.args.at(-1) === "abc123")).toBe(true);
        expect(inspection.findings).toContain("GOVERNED_BASE:origin/main");
        expect(inspection.findings).toContain("DEPENDENCY_LOCK:PRESENT");
        expect(inspection.findings).toContain("CAPABILITY:ANALYTICS:PRESENT");
    });

    it("rejects branch and file traversal outside governed boundaries", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-gateway-"));
        mkdirSync(join(root, "acme--app"));
        const gateway = new GitHubRepositoryGateway(root, new FakeCommands());
        await expect(gateway.createBranch(reference, "main", "abc123")).rejects.toThrow("agent/*");
        await expect(gateway.applyChange(reference, [{ path: "../secret", content: "no" }])).rejects.toThrow("escapes checkout");
    });

    it("opens draft pull requests for an agent branch", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-gateway-"));
        mkdirSync(join(root, "acme--app"));
        const result = await new GitHubRepositoryGateway(root, new FakeCommands())
            .openDraftPullRequest(reference, "agent/vertical-slice", "Build slice", "Governed proposal");
        expect(result.number).toBe(7);
    });
});
