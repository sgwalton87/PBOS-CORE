import { FunctionalAcceptancePlan, PreviewDeploymentRequest } from "./contracts";
import { ProtectedEnvironmentResolver } from "./protected-environment";

export type DurablePreview = NonNullable<FunctionalAcceptancePlan["durablePreview"]>;

export interface PreviewDeploymentGateway {
    deploy(plan: FunctionalAcceptancePlan): Promise<DurablePreview>;
}

interface VercelProject {
    readonly id?: string;
    readonly name?: string;
    readonly link?: Readonly<{ type?: string; org?: string; repo?: string; repoId?: string | number }>;
}

interface VercelEnvironmentVariable {
    readonly id?: string;
    readonly key?: string;
    readonly target?: string | readonly string[];
}

interface VercelDeployment {
    readonly id?: string;
    readonly url?: string;
    readonly readyState?: string;
    readonly target?: string | null;
    readonly meta?: Readonly<Record<string, unknown>>;
    readonly gitSource?: Readonly<{ sha?: string }>;
    readonly errorCode?: string;
    readonly errorMessage?: string;
}

const terminalDeploymentStates = new Set(["ERROR", "CANCELED", "CANCELLED"]);

function query(teamId?: string): string { return teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""; }

function targets(variable: VercelEnvironmentVariable): readonly string[] {
    if (typeof variable.target === "string") return [variable.target];
    return variable.target ?? [];
}

/** Exact-revision Vercel preview boundary. Secret values are resolved in memory and never returned or logged. */
export class VercelPreviewDeploymentGateway implements PreviewDeploymentGateway {
    constructor(private readonly fetcher: typeof fetch = fetch,
        private readonly protectedEnvironment = new ProtectedEnvironmentResolver(),
        private readonly wait: (milliseconds: number) => Promise<void> = milliseconds =>
            new Promise(resolve => setTimeout(resolve, milliseconds)),
        private readonly maximumPolls = 120) {}

    async deploy(plan: FunctionalAcceptancePlan): Promise<DurablePreview> {
        const request = this.assertRequest(plan);
        const requiredEnvironmentVariables = [request.tokenEnvironmentVariable, request.projectEnvironmentVariable,
            ...(request.teamEnvironmentVariable ? [request.teamEnvironmentVariable] : [])];
        const environment = await this.protectedEnvironment.resolve([{
            command: "vercel-preview-deployment", args: [], requiredEnvironmentVariables
        }], plan.protectedEnvironmentFiles);
        const token = environment[request.tokenEnvironmentVariable]!;
        const projectId = environment[request.projectEnvironmentVariable]!;
        const teamId = request.teamEnvironmentVariable ? environment[request.teamEnvironmentVariable] : undefined;
        const project = await this.request<VercelProject>(`/v9/projects/${encodeURIComponent(projectId)}${query(teamId)}`, token);
        this.assertProjectBinding(project, request);
        const environmentResponse = await this.request<{ envs?: readonly VercelEnvironmentVariable[] }>(
            `/v9/projects/${encodeURIComponent(projectId)}/env${query(teamId)}`, token);
        this.assertEnvironmentScopes(environmentResponse.envs ?? [], request);
        const deployment = await this.request<VercelDeployment>(`/v13/deployments${query(teamId)}`,
            token, "POST", {
                name: project.name,
                project: project.id ?? projectId,
                target: "preview",
                gitSource: { type: "github", repoId: project.link!.repoId, ref: request.branch, sha: request.commit },
                meta: { githubCommitSha: request.commit, githubCommitRef: request.branch,
                    githubRepo: request.repository.split("/")[1], githubOrg: request.repository.split("/")[0],
                    pbosMission: "048-web-staging", pbosApprovalId: request.approvalId }
            }, true);
        if (!deployment.id) throw new Error("Vercel did not return a deployment identity.");
        let current = deployment;
        for (let poll = 0; current.readyState !== "READY" && poll < this.maximumPolls; poll += 1) {
            if (terminalDeploymentStates.has(current.readyState ?? "")) {
                throw new Error(`Vercel preview failed: ${current.errorCode ?? "DEPLOYMENT_ERROR"} ${current.errorMessage ?? ""}`.trim());
            }
            await this.wait(2_000);
            current = await this.request<VercelDeployment>(
                `/v13/deployments/${encodeURIComponent(deployment.id)}${query(teamId)}`, token);
        }
        if (current.readyState !== "READY" || !current.url) throw new Error("Vercel preview did not become READY within the governed polling window.");
        if (current.target === "production") throw new Error("PBOS refused a Vercel deployment that resolved to the production target.");
        const deployedCommit = typeof current.meta?.githubCommitSha === "string" ? current.meta.githubCommitSha : current.gitSource?.sha;
        if (deployedCommit !== request.commit) {
            throw new Error(`Vercel deployment lineage mismatch: requested ${request.commit}, received ${deployedCommit ?? "UNKNOWN"}.`);
        }
        const url = current.url.startsWith("http") ? current.url : `https://${current.url}`;
        return { webUrl: url, mobileUrl: url, healthPath: "/login", label: "SEEDED" };
    }

    private assertRequest(plan: FunctionalAcceptancePlan): PreviewDeploymentRequest {
        const request = plan.previewDeployment;
        if (!request || request.provider !== "VERCEL" || request.repository !== plan.repository ||
            request.branch !== plan.branch || request.commit !== plan.commit || request.environment !== "preview" ||
            !request.approvalId.trim() || request.requiredProjectEnvironmentVariables.length === 0 ||
            request.browserTarget !== "DEPLOYED_PREVIEW") {
            throw new Error("Vercel preview request does not match the exact functional acceptance lineage.");
        }
        return request;
    }

    private assertProjectBinding(project: VercelProject, request: PreviewDeploymentRequest): void {
        const [owner, repository] = request.repository.split("/");
        if (!project.id || !project.name || project.link?.type !== "github" || !project.link.repoId ||
            ![repository, request.repository].includes(project.link.repo ?? "") ||
            (project.link.org && project.link.org.toLowerCase() !== owner.toLowerCase())) {
            throw new Error(`Vercel project is not bound to the governed repository ${request.repository}.`);
        }
    }

    private assertEnvironmentScopes(variables: readonly VercelEnvironmentVariable[], request: PreviewDeploymentRequest): void {
        const forKey = (key: string) => variables.filter(variable => variable.key === key);
        const missing = request.requiredProjectEnvironmentVariables.filter(key =>
            !forKey(key).some(variable => targets(variable).includes("preview")));
        if (missing.length) throw new Error(`Vercel preview environment is missing required configuration names: ${missing.join(", ")}.`);
        const productionLeakage = request.previewOnlyEnvironmentVariables.filter(key => forKey(key).some(variable => {
            const scope = targets(variable); return scope.includes("preview") && scope.includes("production");
        }));
        if (productionLeakage.length) {
            throw new Error(`Vercel configuration shares one staging credential entry with production: ${productionLeakage.join(", ")}.`);
        }
    }

    private async request<T>(path: string, token: string, method = "GET", body?: unknown, forceNew = false): Promise<T> {
        const separator = path.includes("?") ? "&" : "?";
        const response = await this.fetcher(`https://api.vercel.com${path}${forceNew ? `${separator}forceNew=1` : ""}`, {
            method,
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(30_000)
        });
        const payload = await response.json().catch(() => ({})) as T & { error?: { code?: string; message?: string } };
        if (!response.ok) {
            throw new Error(`Vercel API ${method} ${path.split("?")[0]} failed (${response.status}): ` +
                `${payload.error?.code ?? "UNKNOWN"} ${payload.error?.message ?? "Request rejected"}`);
        }
        return payload;
    }
}
