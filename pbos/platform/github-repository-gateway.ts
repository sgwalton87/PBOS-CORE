import { execFile } from "child_process";
import { access, chmod, mkdir, readFile, writeFile } from "fs/promises";
import { basename, join, resolve, sep } from "path";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { EcosystemScorecard } from "../certification";
import {
    CertifiedPromotion, RepositoryApproval, RepositoryChangeProposal, RepositoryDispatch,
    RepositoryGateway, RepositoryInspection, RepositoryReference, RepositoryValidationEvidence
} from "./repository-connector";

export interface CommandResult { readonly stdout: string; readonly stderr: string; }
export interface CommandRunnerOptions { readonly timeoutMs?: number; }
export interface CommandRunner { run(command: string, args: readonly string[], cwd?: string,
    options?: CommandRunnerOptions): Promise<CommandResult>; }
export interface GitCommitIdentity { readonly name: string; readonly email: string; }
export class NodeCommandRunner implements CommandRunner {
    async run(command: string, args: readonly string[], cwd?: string, options?: CommandRunnerOptions): Promise<CommandResult> {
        const result = await promisify(execFile)(command, [...args], { cwd, maxBuffer: 10 * 1024 * 1024,
            timeout: options?.timeoutMs });
        return { stdout: result.stdout, stderr: result.stderr };
    }
}

export interface RepositoryFileChange { readonly path: string; readonly content: string; readonly executable?: boolean; }
export interface PullRequestReference { readonly url: string; readonly number: number; readonly branch: string; readonly repository: string; }

/** Concrete GitHub implementation. Every process invocation uses argv arrays; no repository value enters a shell. */
export class GitHubRepositoryGateway implements RepositoryGateway {
    constructor(private readonly workspaceRoot: string, private readonly commands: CommandRunner = new NodeCommandRunner(),
        private readonly commitIdentity?: GitCommitIdentity) {}

    inspect(repository: RepositoryReference): Promise<RepositoryInspection> { return this.inspectRepository(repository); }
    async inspectRepository(repository: RepositoryReference): Promise<RepositoryInspection> {
        const cwd = await this.checkout(repository);
        await this.commands.run("git", ["fetch", "origin", repository.defaultBranch], cwd);
        const governedBase = `origin/${repository.defaultBranch}`;
        const revision = (await this.commands.run("git", ["rev-parse", governedBase], cwd)).stdout.trim();
        const files = (await this.commands.run("git", ["ls-tree", "-r", "--name-only", revision], cwd)).stdout.split("\n").filter(Boolean);
        const status = (await this.commands.run("git", ["status", "--porcelain"], cwd)).stdout.trim();
        const productJourneyFindings = await this.productJourneyFindings(cwd, revision, files);
        const findings = [`TRACKED_FILES:${files.length}`, `GOVERNED_BASE:${governedBase}`, status ? "WORKTREE_DIRTY" : "WORKTREE_CLEAN",
            files.includes("package.json")
                ? files.includes("package-lock.json") ? "DEPENDENCY_LOCK:PRESENT" : "DEPENDENCY_LOCK:MISSING"
                : "DEPENDENCY_MANIFEST:NOT_APPLICABLE",
            ...this.capabilityFindings(files),
            ...productJourneyFindings];
        return { repository, revision, findings, inspectedAt: new Date(), files };
    }

    async workingDirectory(repository: RepositoryReference): Promise<string> {
        return this.checkout(repository);
    }

    async currentRevision(repository: RepositoryReference): Promise<string> {
        return (await this.commands.run("git", ["rev-parse", "HEAD"], await this.checkout(repository))).stdout.trim();
    }

    async createBranch(repository: RepositoryReference, branch: string, baseRevision: string): Promise<string> {
        this.assertBranch(branch);
        const cwd = await this.checkout(repository);
        await this.commands.run("git", ["switch", "-c", branch, baseRevision], cwd);
        return branch;
    }

    /** Creates a tracked-files-only branch worktree so implementation workers cannot read checkout-local secrets. */
    async createIsolatedBranch(repository: RepositoryReference, branch: string, baseRevision: string): Promise<string> {
        this.assertBranch(branch);
        if (!/^[a-f0-9]{7,40}$/i.test(baseRevision)) throw new Error("Isolated worktrees require an exact base revision.");
        const checkout = await this.checkout(repository);
        const root = resolve(this.workspaceRoot, ".worktrees");
        await mkdir(root, { recursive: true });
        const name = `${repository.owner}--${repository.name}--${branch.replaceAll("/", "--")}`;
        const target = resolve(root, name);
        if (!target.startsWith(`${root}${sep}`)) throw new Error("Isolated worktree path escaped the PBOS workspace.");
        try {
            await access(target);
            const currentBranch = (await this.commands.run("git", ["branch", "--show-current"], target)).stdout.trim();
            const governedBase = (await this.commands.run("git", ["merge-base", "HEAD", baseRevision], target)).stdout.trim();
            if (currentBranch !== branch || governedBase !== baseRevision) {
                throw new Error("Existing isolated worktree does not match the governed recovery lineage.");
            }
            return target;
        } catch (error) {
            if (error instanceof Error && error.message === "Existing isolated worktree does not match the governed recovery lineage.") throw error;
        }
        await this.commands.run("git", ["worktree", "add", "-b", branch, target, baseRevision], checkout);
        return target;
    }

    async commitWorkingDirectory(workingDirectory: string, message: string, paths: readonly string[]): Promise<string> {
        if (!message.trim() || paths.length === 0) throw new Error("Commit requires a message and explicit paths.");
        paths.forEach(path => this.safePath(workingDirectory, path));
        await this.commands.run("git", ["add", "--", ...paths], workingDirectory);
        const identity = this.commitIdentity;
        const identityArgs = identity ? ["-c", `user.name=${identity.name}`, "-c", `user.email=${identity.email}`] : [];
        await this.commands.run("git", [...identityArgs, "commit", "-m", message], workingDirectory);
        return (await this.commands.run("git", ["rev-parse", "HEAD"], workingDirectory)).stdout.trim();
    }

    async pushWorkingDirectory(workingDirectory: string, branch: string): Promise<void> {
        this.assertBranch(branch);
        await this.commands.run("git", ["push", "-u", "origin", branch], workingDirectory);
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

    async applyTextReplacements(repository: RepositoryReference,
        replacements: readonly { readonly path: string; readonly search: string; readonly replacement: string }[]): Promise<readonly string[]> {
        const cwd = await this.checkout(repository);
        for (const change of replacements) {
            if (!change.search) throw new Error(`Repository text replacement requires a non-empty search value: ${change.path}`);
            const target = this.safePath(cwd, change.path);
            const current = await readFile(target, "utf8");
            if (!current.includes(change.search)) {
                if (current.includes(change.replacement)) continue;
                throw new Error(`Repository source changed before deterministic remediation: ${change.path}`);
            }
            await writeFile(target, current.replaceAll(change.search, change.replacement), "utf8");
        }
        return [...new Set(replacements.map(item => item.path))];
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
        const identity = this.commitIdentity;
        const identityArgs = identity ? ["-c", `user.name=${identity.name}`, "-c", `user.email=${identity.email}`] : [];
        await this.commands.run("git", [...identityArgs, "commit", "-m", message], cwd);
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

    async prepareExpoDependencyLock(repository: RepositoryReference, workspacePath: string): Promise<void> {
        const cwd = await this.checkout(repository);
        const workspace = this.safePath(cwd, workspacePath);
        await this.commands.run("npx", ["--yes", "expo@~57.0.0", "install", "--fix"], workspace);
        await this.commands.run("npm", ["install", "--package-lock-only", "--ignore-scripts"], cwd);
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
        throw new Error("Legacy repository dispatch is disabled by PBS-5000; use the governed branch/change/commit/push/draft-PR production path.");
    }

    async collectEvidence(dispatch: RepositoryDispatch): Promise<readonly RepositoryValidationEvidence[]> {
        return this.collectValidationEvidence(dispatch);
    }
    async collectValidationEvidence(dispatch: RepositoryDispatch): Promise<readonly RepositoryValidationEvidence[]> {
        throw new Error(`Legacy dispatch evidence is disabled by PBS-5000 for ${dispatch.dispatchId}; collect exact-revision GitHub checks through the production runtime.`);
    }

    async promote(dispatch: RepositoryDispatch, scorecard: EcosystemScorecard): Promise<CertifiedPromotion> {
        return this.mergeApprovedChange(dispatch, scorecard);
    }
    async mergeApprovedChange(dispatch: RepositoryDispatch, scorecard: EcosystemScorecard, pullRequest?: PullRequestReference): Promise<CertifiedPromotion> {
        void scorecard; void pullRequest;
        throw new Error(`Legacy scorecard promotion is disabled by PBS-5000 for ${dispatch.dispatchId}; use kernel certification and explicit pull-request promotion.`);
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

    private async productJourneyFindings(cwd: string, revision: string, files: readonly string[]): Promise<readonly string[]> {
        const manifestPath = "pbos/readiness/048-canon-journeys.json";
        if (!files.includes(manifestPath)) return [];
        try {
            const content = (await this.commands.run("git", ["show", `${revision}:${manifestPath}`], cwd)).stdout;
            const parsed = JSON.parse(content) as { productJourneys?: Array<{ journeyId?: unknown }> };
            const journeyIds = (parsed.productJourneys ?? []).flatMap(item => {
                const journeyId = typeof item?.journeyId === "string" ? item.journeyId.trim() : "";
                return /^[A-Z0-9-]+$/.test(journeyId) ? [journeyId] : [];
            });
            return [...new Set(journeyIds)].sort().map(journeyId => `PRODUCT_JOURNEY_ID:${journeyId}:PRESENT`);
        } catch {
            return [];
        }
    }
}
