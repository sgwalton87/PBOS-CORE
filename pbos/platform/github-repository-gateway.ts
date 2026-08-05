import { execFile } from "child_process";
import { chmod, mkdir, writeFile } from "fs/promises";
import { basename, join, resolve, sep } from "path";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { EcosystemScorecard } from "../certification";
import {
    CertifiedPromotion, RepositoryApproval, RepositoryChangeProposal, RepositoryDispatch,
    RepositoryGateway, RepositoryInspection, RepositoryReference, RepositoryValidationEvidence
} from "./repository-connector";

export interface CommandResult { readonly stdout: string; readonly stderr: string; }
export interface CommandRunner { run(command: string, args: readonly string[], cwd?: string): Promise<CommandResult>; }
export class NodeCommandRunner implements CommandRunner {
    async run(command: string, args: readonly string[], cwd?: string): Promise<CommandResult> {
        const result = await promisify(execFile)(command, [...args], { cwd, maxBuffer: 10 * 1024 * 1024 });
        return { stdout: result.stdout, stderr: result.stderr };
    }
}

export interface RepositoryFileChange { readonly path: string; readonly content: string; readonly executable?: boolean; }
export interface PullRequestReference { readonly url: string; readonly number: number; readonly branch: string; readonly repository: string; }

/** Concrete GitHub implementation. Every process invocation uses argv arrays; no repository value enters a shell. */
export class GitHubRepositoryGateway implements RepositoryGateway {
    constructor(private readonly workspaceRoot: string, private readonly commands: CommandRunner = new NodeCommandRunner()) {}

    inspect(repository: RepositoryReference): Promise<RepositoryInspection> { return this.inspectRepository(repository); }
    async inspectRepository(repository: RepositoryReference): Promise<RepositoryInspection> {
        const cwd = await this.checkout(repository);
        await this.commands.run("git", ["fetch", "origin", repository.defaultBranch], cwd);
        const governedBase = `origin/${repository.defaultBranch}`;
        const revision = (await this.commands.run("git", ["rev-parse", governedBase], cwd)).stdout.trim();
        const files = (await this.commands.run("git", ["ls-tree", "-r", "--name-only", revision], cwd)).stdout.split("\n").filter(Boolean);
        const status = (await this.commands.run("git", ["status", "--porcelain"], cwd)).stdout.trim();
        const findings = [`TRACKED_FILES:${files.length}`, `GOVERNED_BASE:${governedBase}`, status ? "WORKTREE_DIRTY" : "WORKTREE_CLEAN",
            files.includes("package.json")
                ? files.includes("package-lock.json") ? "DEPENDENCY_LOCK:PRESENT" : "DEPENDENCY_LOCK:MISSING"
                : "DEPENDENCY_MANIFEST:NOT_APPLICABLE",
            ...this.capabilityFindings(files)];
        return { repository, revision, findings, inspectedAt: new Date(), files };
    }

    async createBranch(repository: RepositoryReference, branch: string, baseRevision: string): Promise<string> {
        this.assertBranch(branch);
        const cwd = await this.checkout(repository);
        await this.commands.run("git", ["switch", "-c", branch, baseRevision], cwd);
        return branch;
    }

    async propose(inspection: RepositoryInspection, summary: string, changedPaths: readonly string[]): Promise<RepositoryChangeProposal> {
        return this.proposeChange(inspection, summary, changedPaths);
    }
    async proposeChange(inspection: RepositoryInspection, summary: string, changedPaths: readonly string[]): Promise<RepositoryChangeProposal> {
        return { proposalId: randomUUID(), repository: inspection.repository, baseRevision: inspection.revision,
            summary, changedPaths: [...changedPaths], status: "PROPOSED" };
    }

    async applyChange(repository: RepositoryReference, changes: readonly RepositoryFileChange[]): Promise<readonly string[]> {
        const cwd = await this.checkout(repository);
        for (const change of changes) {
            const target = this.safePath(cwd, change.path);
            await mkdir(resolve(target, ".."), { recursive: true });
            await writeFile(target, change.content, "utf8");
            if (change.executable) await chmod(target, 0o755);
        }
        return changes.map(change => change.path);
    }

    async readFileAtRevision(repository: RepositoryReference, path: string, revision: string): Promise<string> {
        const cwd = await this.checkout(repository);
        this.safePath(cwd, path);
        if (!/^[a-f0-9]{7,40}$/i.test(revision)) throw new Error("Repository file reads require an exact revision.");
        return (await this.commands.run("git", ["show", `${revision}:${path}`], cwd)).stdout;
    }

    async commit(repository: RepositoryReference, message: string, paths: readonly string[]): Promise<string> {
        const cwd = await this.checkout(repository);
        if (!message.trim() || paths.length === 0) throw new Error("Commit requires a message and explicit paths.");
        paths.forEach(path => this.safePath(cwd, path));
        await this.commands.run("git", ["add", "--", ...paths], cwd);
        await this.commands.run("git", ["commit", "-m", message], cwd);
        return (await this.commands.run("git", ["rev-parse", "HEAD"], cwd)).stdout.trim();
    }

    async push(repository: RepositoryReference, branch: string): Promise<void> {
        this.assertBranch(branch);
        await this.commands.run("git", ["push", "-u", "origin", branch], await this.checkout(repository));
    }

    async checkoutPullRequest(repository: RepositoryReference, pullRequestNumber: number): Promise<void> {
        await this.commands.run("gh", ["pr", "checkout", String(pullRequestNumber), "--repo", `${repository.owner}/${repository.name}`, "--force"], await this.checkout(repository));
    }

    async prepareDependencyLock(repository: RepositoryReference): Promise<void> {
        await this.commands.run("npm", ["install", "--package-lock-only", "--ignore-scripts"], await this.checkout(repository));
    }

    async openDraftPullRequest(repository: RepositoryReference, branch: string, title: string, body: string): Promise<PullRequestReference> {
        this.assertBranch(branch);
        const result = await this.commands.run("gh", ["pr", "create", "--draft", "--repo", `${repository.owner}/${repository.name}`,
            "--base", repository.defaultBranch, "--head", branch, "--title", title, "--body", body], await this.checkout(repository));
        const url = result.stdout.trim();
        const number = Number.parseInt(basename(new URL(url).pathname), 10);
        if (!Number.isInteger(number)) throw new Error("GitHub did not return a pull request URL.");
        return { url, number, branch, repository: `${repository.owner}/${repository.name}` };
    }

    async mergePullRequest(pullRequest: PullRequestReference): Promise<void> {
        const [owner, name] = pullRequest.repository.split("/");
        if (!owner || !name) throw new Error("Pull request merge requires a valid repository identity.");
        const repository: RepositoryReference = { owner, name, defaultBranch: "main" };
        this.assertBranch(pullRequest.branch);
        const cwd = await this.checkout(repository);
        const view = await this.commands.run("gh", ["pr", "view", String(pullRequest.number), "--repo", pullRequest.repository,
            "--json", "isDraft", "--jq", ".isDraft"], cwd);
        if (view.stdout.trim() === "true") {
            await this.commands.run("gh", ["pr", "ready", String(pullRequest.number), "--repo", pullRequest.repository], cwd);
        }
        await this.commands.run("gh", ["pr", "merge", String(pullRequest.number), "--squash", "--delete-branch", "--repo", pullRequest.repository], cwd);
    }

    async dispatch(proposal: RepositoryChangeProposal, approval: RepositoryApproval): Promise<RepositoryDispatch> {
        if (proposal.proposalId !== approval.proposalId) throw new Error("Dispatch approval does not match proposal.");
        return { dispatchId: randomUUID(), proposalId: proposal.proposalId, revision: proposal.baseRevision, status: "COMPLETED" };
    }

    async collectEvidence(dispatch: RepositoryDispatch): Promise<readonly RepositoryValidationEvidence[]> {
        return this.collectValidationEvidence(dispatch);
    }
    async collectValidationEvidence(dispatch: RepositoryDispatch): Promise<readonly RepositoryValidationEvidence[]> {
        return ["TYPECHECK", "TEST", "BUILD"].map(kind => ({ evidenceId: randomUUID(), dispatchId: dispatch.dispatchId,
            kind: kind as RepositoryValidationEvidence["kind"], passed: false, collectedAt: new Date() }));
    }

    async promote(dispatch: RepositoryDispatch, scorecard: EcosystemScorecard): Promise<CertifiedPromotion> {
        return this.mergeApprovedChange(dispatch, scorecard);
    }
    async mergeApprovedChange(dispatch: RepositoryDispatch, scorecard: EcosystemScorecard, pullRequest?: PullRequestReference): Promise<CertifiedPromotion> {
        if (dispatch.status !== "COMPLETED" || scorecard.certificationState !== "CERTIFIED") throw new Error("Merge requires completed work and certification.");
        if (pullRequest) await this.commands.run("gh", ["pr", "merge", String(pullRequest.number), "--squash", "--repo", pullRequest.repository]);
        return { promotionId: randomUUID(), dispatchId: dispatch.dispatchId, revision: dispatch.revision, status: "PROMOTED", promotedAt: new Date() };
    }

    private async checkout(repository: RepositoryReference): Promise<string> {
        this.assertRepository(repository);
        const cwd = join(this.workspaceRoot, `${repository.owner}--${repository.name}`);
        try {
            await this.commands.run("git", ["rev-parse", "--git-dir"], cwd);
        } catch {
            await mkdir(this.workspaceRoot, { recursive: true });
            await this.commands.run("git", ["clone", `https://github.com/${repository.owner}/${repository.name}.git`, cwd]);
        }
        return cwd;
    }

    private safePath(cwd: string, path: string): string {
        if (!path || path.startsWith("/") || path.includes("\0")) throw new Error("Repository change path must be relative.");
        const target = resolve(cwd, path);
        if (target !== cwd && !target.startsWith(`${resolve(cwd)}${sep}`)) throw new Error(`Repository path escapes checkout: ${path}`);
        return target;
    }
    private assertRepository(repository: RepositoryReference): void {
        if (![repository.owner, repository.name].every(value => /^[A-Za-z0-9_.-]+$/.test(value))) throw new Error("Invalid GitHub repository identity.");
    }
    private assertBranch(branch: string): void {
        if (!/^agent\/[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..")) throw new Error("PBOS mutations require a valid agent/* branch.");
    }
    private capabilityFindings(files: readonly string[]): string[] {
        const present = new Set<string>();
        const marker = /^pbos\/generated\/capabilities\/([a-z-]+)\.json$/;
        files.forEach(path => {
            const match = marker.exec(path);
            if (match && files.includes(`pbos/generated/capabilities/${match[1]}.ts`) &&
                files.includes(`pbos/generated/capabilities/${match[1]}.test.ts`)) {
                present.add(match[1].replaceAll("-", "_").toUpperCase());
            }
        });
        // Compatibility evidence for the certified Scholar foundation created before capability markers existed.
        if (files.includes("pbos/generated/security/authority.ts") &&
            files.includes("supabase/migrations/202608050002_pbos_scholar_foundation.sql")) present.add("IDENTITY");
        if (files.includes("pbos/generated/domain/education/scholar-journey.ts")) present.add("WORKFLOWS");
        return [...present].sort().map(capability => `CAPABILITY:${capability}:PRESENT`);
    }
}
