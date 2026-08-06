import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
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
        expect(await new GitHubRepositoryGateway(root, commands).currentRevision(reference)).toBe("abc123");
        expect(commands.calls).toContainEqual(expect.objectContaining({ command: "git", args: ["rev-parse", "HEAD"] }));
    });

    it("rejects branch and file traversal outside governed boundaries", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-gateway-"));
        mkdirSync(join(root, "acme--app"));
        const gateway = new GitHubRepositoryGateway(root, new FakeCommands());
        await expect(gateway.createBranch(reference, "main", "abc123")).rejects.toThrow("agent/*");
        await expect(gateway.applyChange(reference, [{ path: "../secret", content: "no" }])).rejects.toThrow("escapes checkout");
    });

    it("preserves executable intent for portable application automation", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-gateway-"));
        const checkout = join(root, "acme--app");
        mkdirSync(checkout);
        const gateway = new GitHubRepositoryGateway(root, new FakeCommands());
        await gateway.applyChange(reference, [{ path: ".githooks/pbos-archivist-post-commit", content: "#!/bin/sh\n", executable: true }]);
        expect(statSync(join(checkout, ".githooks/pbos-archivist-post-commit")).mode & 0o111).not.toBe(0);
    });

    it("applies exact idempotent text remediation without accepting source drift", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-gateway-"));
        const checkout = join(root, "acme--app");
        mkdirSync(checkout);
        writeFileSync(join(checkout, "connector.ts"), "registration=legacy\n");
        const gateway = new GitHubRepositoryGateway(root, new FakeCommands());
        const replacement = { path: "connector.ts", search: "legacy", replacement: "canonical" };
        await gateway.applyTextReplacements(reference, [replacement]);
        await gateway.applyTextReplacements(reference, [replacement]);
        expect(readFileSync(join(checkout, "connector.ts"), "utf8")).toBe("registration=canonical\n");
        await expect(gateway.applyTextReplacements(reference,
            [{ path: "connector.ts", search: "missing", replacement: "new" }])).rejects.toThrow("source changed");
    });

    it("opens draft pull requests for an agent branch", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-gateway-"));
        mkdirSync(join(root, "acme--app"));
        const result = await new GitHubRepositoryGateway(root, new FakeCommands())
            .openDraftPullRequest(reference, "agent/vertical-slice", "Build slice", "Governed proposal");
        expect(result.number).toBe(7);
    });

    it("reads application source only from an exact governed revision", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-gateway-"));
        mkdirSync(join(root, "acme--app"));
        const commands = new FakeCommands();
        await new GitHubRepositoryGateway(root, commands).readFileAtRevision(reference, "app/start/page.tsx", "abc1234");
        expect(commands.calls).toContainEqual(expect.objectContaining({ command: "git", args: ["show", "abc1234:app/start/page.tsx"] }));
        await expect(new GitHubRepositoryGateway(root, commands)
            .readFileAtRevision(reference, "app/start/page.tsx", "main")).rejects.toThrow("exact revision");
    });

    it("fences the legacy false-completion dispatch path", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-gateway-"));
        mkdirSync(join(root, "acme--app"));
        const gateway = new GitHubRepositoryGateway(root, new FakeCommands());
        await expect(gateway.dispatch({ proposalId: "proposal", repository: reference, baseRevision: "abc1234",
            summary: "legacy", changedPaths: ["src/index.ts"], status: "PROPOSED" }, {
            proposalId: "proposal", approvedBy: "operator", approvalId: "approval", approvedAt: new Date()
        })).rejects.toThrow("disabled by PBS-5000");
    });

    it("promotes a validated draft pull request only through explicit argv-safe operations", async () => {
        const root = mkdtempSync(join(tmpdir(), "pbos-gateway-"));
        mkdirSync(join(root, "acme--app"));
        const commands = new FakeCommands();
        commands.run = async (command: string, args: readonly string[], cwd?: string) => {
            commands.calls.push({ command, args, cwd });
            if (args[0] === "rev-parse" && args[1] === "--git-dir") return { stdout: ".git\n", stderr: "" };
            if (command === "gh" && args[1] === "view") return { stdout: "true\n", stderr: "" };
            return { stdout: "", stderr: "" };
        };
        await new GitHubRepositoryGateway(root, commands).mergePullRequest({ number: 7, branch: "agent/vertical-slice",
            repository: "acme/app", url: "https://github.com/acme/app/pull/7" });
        expect(commands.calls).toContainEqual(expect.objectContaining({ command: "gh",
            args: ["pr", "ready", "7", "--repo", "acme/app"] }));
        expect(commands.calls).toContainEqual(expect.objectContaining({ command: "gh",
            args: ["pr", "merge", "7", "--squash", "--delete-branch", "--repo", "acme/app"] }));
    });
});
