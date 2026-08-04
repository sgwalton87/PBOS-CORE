import { GitHubRepositoryGateway, RepositoryReference } from "../platform";
import { RemediationChangeSet, RemediationRun } from "./contracts";
import { ProjectRemediationProfileRegistry, RemediationPackRegistry } from "./remediation-pack-registry";
import { RemediationHandler } from "./resumable-remediation-engine";

export class UniversalRemediationHandler implements RemediationHandler {
    constructor(private readonly gateway: GitHubRepositoryGateway, private readonly packs: RemediationPackRegistry,
        private readonly projects: ProjectRemediationProfileRegistry) {}

    async propose(run: RemediationRun): Promise<RemediationChangeSet | undefined> {
        const profile = this.projects.get(run.systemId);
        if (!profile || profile.repository !== run.pullRequest.repository) return undefined;
        const failureText = run.evidence.filter(item => item.state === "FAILED").map(item => `${item.name}\n${item.failureLog ?? ""}`).join("\n").toLowerCase();
        const context = { run, blueprint: profile.createBlueprint(), failureText };
        const selected = this.packs.matching(profile, context);
        if (selected.length === 0) return undefined;
        const results = await Promise.all(selected.map(pack => pack.remediate(context)));
        const files = new Map<string, string>();
        for (const result of results) for (const file of result.files) {
            const existing = files.get(file.path);
            if (existing !== undefined && existing !== file.content) throw new Error(`Remediation packs conflict on path: ${file.path}`);
            files.set(file.path, file.content);
        }
        return { summary: results.map(result => result.summary).join("; "),
            files: [...files].map(([path, content]) => ({ path, content })),
            prepareDependencyLock: results.some(result => result.prepareDependencyLock) };
    }

    async apply(run: RemediationRun, changes: RemediationChangeSet): Promise<string> {
        const repository = this.reference(run.pullRequest.repository);
        await this.gateway.checkoutPullRequest(repository, run.pullRequest.number);
        await this.gateway.applyChange(repository, changes.files);
        if (changes.prepareDependencyLock) await this.gateway.prepareDependencyLock(repository);
        const paths = [...new Set([...changes.files.map(file => file.path), ...(changes.prepareDependencyLock ? ["package-lock.json"] : [])])];
        if (paths.length === 0) throw new Error("Remediation produced no repository changes.");
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
