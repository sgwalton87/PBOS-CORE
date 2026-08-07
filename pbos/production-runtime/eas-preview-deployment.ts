import { execFile } from "child_process";
import { join } from "path";
import { promisify } from "util";
import { EasPreviewDeploymentRequest, FunctionalAcceptancePlan } from "./contracts";
import { DurablePreview, PreviewDeploymentGateway } from "./vercel-preview-deployment";
import { ProtectedEnvironmentResolver } from "./protected-environment";

interface EasBuild {
    readonly id?: string;
    readonly platform?: string;
    readonly status?: string;
    readonly gitCommitHash?: string;
    readonly buildDetailsPageUrl?: string;
    readonly project?: Readonly<{ id?: string }>;
    readonly artifacts?: Readonly<{ buildUrl?: string; applicationArchiveUrl?: string }>;
}

export interface EasCommandRunner {
    run(command: string, args: readonly string[], options: Readonly<{
        cwd: string;
        env: NodeJS.ProcessEnv;
        timeoutMs: number;
    }>): Promise<Readonly<{ stdout: string; stderr: string }>>;
}

class ExecFileEasCommandRunner implements EasCommandRunner {
    async run(command: string, args: readonly string[], options: Readonly<{
        cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number;
    }>): Promise<Readonly<{ stdout: string; stderr: string }>> {
        const result = await promisify(execFile)(command, [...args], {
            cwd: options.cwd, env: options.env, timeout: options.timeoutMs, maxBuffer: 20 * 1024 * 1024
        });
        return { stdout: result.stdout, stderr: result.stderr };
    }
}

function buildFor(builds: readonly EasBuild[], platform: "IOS" | "ANDROID"): EasBuild {
    const build = builds.find(candidate => candidate.platform?.toUpperCase() === platform);
    if (!build) throw new Error(`EAS did not return a ${platform} build.`);
    return build;
}

function parseBuilds(output: string): readonly EasBuild[] {
    const start = output.indexOf("[");
    const end = output.lastIndexOf("]");
    if (start < 0 || end < start) throw new Error("EAS did not return machine-readable build evidence.");
    const parsed = JSON.parse(output.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) throw new Error("EAS build evidence is not an array.");
    return parsed as readonly EasBuild[];
}

/**
 * Exact-revision mobile release boundary. It creates installable internal builds and store binaries,
 * then auto-submits the store binaries only to TestFlight and Google Play internal testing.
 * Public store release is deliberately impossible through this gateway.
 */
export class EasPreviewDeploymentGateway implements PreviewDeploymentGateway {
    constructor(private readonly commands: EasCommandRunner = new ExecFileEasCommandRunner(),
        private readonly protectedEnvironment = new ProtectedEnvironmentResolver()) {}

    async deploy(plan: FunctionalAcceptancePlan): Promise<DurablePreview> {
        const request = this.assertRequest(plan);
        const requiredEnvironmentVariables = [request.tokenEnvironmentVariable,
            request.projectEnvironmentVariable, request.webPreviewEnvironmentVariable];
        const environment = await this.protectedEnvironment.resolve([{
            command: "eas-mobile-release", args: [], requiredEnvironmentVariables
        }], plan.protectedEnvironmentFiles);
        const cwd = join(plan.workingDirectory, request.applicationDirectory);
        const command = "npx";
        const prefix = ["--yes", `eas-cli@${request.cliVersion}`, "build", "--platform", "all"];
        const shared = ["--non-interactive", "--wait", "--json", "--freeze-credentials",
            "--message", `PBOS ${request.commit}`];
        const previewResult = await this.commands.run(command,
            [...prefix, "--profile", request.previewProfile, ...shared], { cwd, env: environment, timeoutMs: 3_600_000 });
        const previewBuilds = parseBuilds(previewResult.stdout);
        const iosPreview = buildFor(previewBuilds, "IOS");
        const androidPreview = buildFor(previewBuilds, "ANDROID");
        const expectedProjectId = environment[request.projectEnvironmentVariable]!;
        this.assertBuild(iosPreview, request, expectedProjectId, true);
        this.assertBuild(androidPreview, request, expectedProjectId, true);

        const storeResult = await this.commands.run(command,
            [...prefix, "--profile", request.storeProfile, "--auto-submit-with-profile", request.submitProfile,
                "--what-to-test", "PBOS exact-revision Scholar acceptance", ...shared],
            { cwd, env: environment, timeoutMs: 3_600_000 });
        const storeBuilds = parseBuilds(storeResult.stdout);
        const iosStore = buildFor(storeBuilds, "IOS");
        const androidStore = buildFor(storeBuilds, "ANDROID");
        this.assertBuild(iosStore, request, expectedProjectId, false);
        this.assertBuild(androidStore, request, expectedProjectId, false);

        const iosUrl = this.installUrl(iosPreview);
        const androidUrl = this.installUrl(androidPreview);
        const webUrl = environment[request.webPreviewEnvironmentVariable]!;
        this.assertHttps(webUrl, "web preview");
        return {
            webUrl,
            mobileUrl: androidUrl,
            iosUrl,
            androidUrl,
            healthPath: "/login",
            mobileHealthPath: "",
            providerEvidence: {
                provider: "EAS",
                commit: request.commit,
                iosPreviewBuildId: iosPreview.id!,
                androidPreviewBuildId: androidPreview.id!,
                iosStoreBuildId: iosStore.id!,
                androidStoreBuildId: androidStore.id!,
                distributionTarget: request.distributionTarget
            },
            label: "SEEDED"
        };
    }

    private assertRequest(plan: FunctionalAcceptancePlan): EasPreviewDeploymentRequest {
        const request = plan.previewDeployment;
        if (!request || request.provider !== "EAS" || request.repository !== plan.repository ||
            request.branch !== plan.branch || request.commit !== plan.commit || request.environment !== "preview" ||
            !request.approvalId.trim() || request.applicationDirectory !== "apps/mobile" ||
            request.distributionTarget !== "TESTFLIGHT_AND_PLAY_INTERNAL" ||
            request.browserTarget !== "DEPLOYED_PREVIEW" ||
            request.platforms.join(",") !== "IOS,ANDROID" || !/^\d+\.\d+\.\d+$/.test(request.cliVersion)) {
            throw new Error("EAS release request does not match the exact functional acceptance lineage.");
        }
        return request;
    }

    private assertBuild(build: EasBuild, request: EasPreviewDeploymentRequest, expectedProjectId: string,
        requireInstallUrl: boolean): void {
        if (!build.id || build.status?.toUpperCase() !== "FINISHED" || build.gitCommitHash !== request.commit) {
            throw new Error(`EAS build lineage or status is invalid for ${build.platform ?? "UNKNOWN"}.`);
        }
        if (build.project?.id && build.project.id !== expectedProjectId) {
            throw new Error(`EAS build is bound to project ${build.project.id}, not the governed project ${expectedProjectId}.`);
        }
        if (requireInstallUrl) this.installUrl(build);
    }

    private installUrl(build: EasBuild): string {
        const url = build.buildDetailsPageUrl ?? build.artifacts?.buildUrl ?? build.artifacts?.applicationArchiveUrl;
        if (!url) throw new Error(`EAS ${build.platform ?? "UNKNOWN"} internal build has no install URL.`);
        this.assertHttps(url, `${build.platform ?? "mobile"} install`);
        return url;
    }

    private assertHttps(value: string, label: string): void {
        const url = new URL(value);
        if (url.protocol !== "https:") throw new Error(`EAS ${label} URL must use HTTPS.`);
    }
}

/** One deployment authority with provider-specific adapters; unknown providers fail closed. */
export class GovernedPreviewDeploymentGateway implements PreviewDeploymentGateway {
    constructor(private readonly vercel: PreviewDeploymentGateway,
        private readonly eas: PreviewDeploymentGateway = new EasPreviewDeploymentGateway()) {}

    deploy(plan: FunctionalAcceptancePlan): Promise<DurablePreview> {
        if (plan.previewDeployment?.provider === "VERCEL") return this.vercel.deploy(plan);
        if (plan.previewDeployment?.provider === "EAS") return this.eas.deploy(plan);
        throw new Error("No governed preview deployment provider is registered for this plan.");
    }
}
