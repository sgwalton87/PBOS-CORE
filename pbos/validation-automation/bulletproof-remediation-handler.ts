import { ApplicationScaffoldGenerator } from "../application-scaffold";
import { GitHubRepositoryGateway, RepositoryReference } from "../platform";
import { createBulletproofBlueprint } from "../reference-systems";
import { RemediationChangeSet, RemediationRun } from "./contracts";
import { RemediationHandler } from "./resumable-remediation-engine";

export class BulletproofRemediationHandler implements RemediationHandler {
    constructor(private readonly gateway: GitHubRepositoryGateway, private readonly scaffolds = new ApplicationScaffoldGenerator()) {}

    async propose(run: RemediationRun): Promise<RemediationChangeSet | undefined> {
        const logs = run.evidence.filter(item => item.state === "FAILED").map(item => item.failureLog ?? item.name).join("\n").toLowerCase();
        const supported = ["package-lock", "npm ci", "tsconfig", "couldn't find any `pages` or `app` directory", "module not found", "typecheck", "test", "build"];
        if (!supported.some(signal => logs.includes(signal))) return undefined;
        const scaffold = this.scaffolds.generate({ blueprint: createBulletproofBlueprint(), includeFirstVerticalSlice: true });
        return { summary: "Repair generated application foundation from collected validation evidence", files: scaffold.files };
    }

    async apply(run: RemediationRun, changes: RemediationChangeSet): Promise<string> {
        const repository = this.reference(run.pullRequest.repository);
        await this.gateway.checkoutPullRequest(repository, run.pullRequest.number);
        await this.gateway.applyChange(repository, changes.files);
        await this.gateway.prepareDependencyLock(repository);
        const paths = [...new Set([...changes.files.map(file => file.path), "package-lock.json"])];
        const revision = await this.gateway.commit(repository, `fix: remediate PBOS validation attempt ${run.attempt + 1}`, paths);
        await this.gateway.push(repository, run.pullRequest.branch);
        return revision;
    }

    private reference(value: string): RepositoryReference {
        const [owner, name] = value.split("/");
        if (!owner || !name) throw new Error(`Invalid repository identity: ${value}`);
        return { owner, name, defaultBranch: "main" };
    }
}
