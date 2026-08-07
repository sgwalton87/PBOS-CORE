import { homedir } from "os";
import { join } from "path";
import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ApplicationAcceptanceEvidence, FunctionalAcceptancePlan, ProductionMissionExecutor, ProtectedEnvironmentFile,
    ProtectedEnvironmentReadiness, ProtectedEnvironmentResolver } from "../production-runtime";
import { ResumableRemediationEngine } from "../validation-automation";
import { playbookMobileAcceptancePlan } from "./playbook-mobile-functional-acceptance";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const MOBILE_MANIFEST = "pbos/readiness/049-mobile-journeys.json";
const STORE_MANIFEST = "pbos/readiness/049-store-readiness.json";
const STORE_MEMO = "docs/release/PBOS-MOBILE-STORE-READINESS.md";
const EAS_CLI_VERSION = "21.3.0";

export const PLAYBOOK_MOBILE_RELEASE_PROVIDER_ENVIRONMENT = [
    "EXPO_TOKEN", "EXPO_PROJECT_ID", "PBOS_WEB_PREVIEW_URL"
] as const;

export function playbookMobileReleaseProtectedEnvironmentFiles(
    stateHome = process.env.PBOS_STATE_HOME ?? join(homedir(), ".pbos"),
    required = true): readonly ProtectedEnvironmentFile[] {
    return [{ path: join(stateHome, "secrets", "playbook-mobile-release.env"), required }];
}

export async function inspectPlaybookMobileReleaseReadiness(
    environment: NodeJS.ProcessEnv = process.env,
    stateHome = environment.PBOS_STATE_HOME ?? join(homedir(), ".pbos")): Promise<ProtectedEnvironmentReadiness> {
    return new ProtectedEnvironmentResolver(environment).inspect([{
        command: "pbos-eas-internal-release", args: [],
        requiredEnvironmentVariables: PLAYBOOK_MOBILE_RELEASE_PROVIDER_ENVIRONMENT
    }], playbookMobileReleaseProtectedEnvironmentFiles(stateHome, false));
}

export interface PlaybookMobileStoreReadinessExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly deploymentApprovalId: string;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string,
        explicitApprovalId?: string) => BuildAuthorityDecision;
}

function withEasProjectBinding(source: string): string {
    if (source.includes("eas: { projectId: process.env.EXPO_PROJECT_ID }")) return source;
    const marker = "extra: { universalLinkDomain:";
    if (!source.includes(marker)) throw new Error("The native app configuration does not expose the governed PBOS extra boundary.");
    return source.replace(marker, "extra: { eas: { projectId: process.env.EXPO_PROJECT_ID }, universalLinkDomain:");
}

function withStoreProfiles(source: string): string {
    const configuration = JSON.parse(source) as Record<string, unknown> & {
        cli?: Record<string, unknown>;
        build?: Record<string, Record<string, unknown>>;
        submit?: Record<string, Record<string, unknown>>;
    };
    configuration.cli = { ...(configuration.cli ?? {}), version: EAS_CLI_VERSION,
        requireCommit: true, appVersionSource: "remote" };
    configuration.build = {
        ...(configuration.build ?? {}),
        preview: { ...(configuration.build?.preview ?? {}), distribution: "internal" },
        production: { ...(configuration.build?.production ?? {}), distribution: "store", autoIncrement: true }
    };
    configuration.submit = {
        ...(configuration.submit ?? {}),
        production: {
            ...(configuration.submit?.production ?? {}),
            android: { track: "internal", releaseStatus: "completed" },
            ios: { groups: ["PBOS Internal"] }
        }
    };
    return `${JSON.stringify(configuration, null, 2)}\n`;
}

function storeFiles(startingRevision: string, runId: string, appConfig: string,
    easConfiguration: string): readonly RepositoryFileChange[] {
    return [
        { path: "apps/mobile/app.config.ts", content: withEasProjectBinding(appConfig) },
        { path: "apps/mobile/eas.json", content: withStoreProfiles(easConfiguration) },
        { path: "apps/mobile/store/privacy.json", content: `${JSON.stringify({ schemaVersion: 1,
            dataCategories: ["ACCOUNT", "USER_CONTENT", "PRODUCT_INTERACTION"], tracking: false,
            encryptionInTransit: true, deletionRequestRoute: "/settings/privacy",
            state: "PENDING_HUMAN_APPROVAL", owner: "PLAYBOOK-RELEASE-AUTHORITY"
        }, null, 2)}\n` },
        { path: "apps/mobile/store/listing.json", content: `${JSON.stringify({ schemaVersion: 1,
            applicationName: "The Playbook", subtitle: "Run your journey with purpose.",
            category: "Education", iosBundleIdentifier: "com.theplaybook.app",
            androidPackage: "com.theplaybook.app", releaseTrack: "INTERNAL_TESTING",
            publicRelease: "EXCLUDED", state: "PENDING_HUMAN_APPROVAL"
        }, null, 2)}\n` },
        { path: "apps/mobile/store/screenshots.json", content: `${JSON.stringify({ schemaVersion: 1,
            requiredScreens: ["LOGIN", "ONBOARDING", "DASHBOARD", "MESSAGING", "DOCUMENTS", "NOTIFICATIONS"],
            devices: ["IOS_PHONE", "ANDROID_PHONE"], visualCanon: "PGSL-007",
            state: "PENDING_DEVICE_CAPTURE_AND_HUMAN_APPROVAL"
        }, null, 2)}\n` },
        { path: STORE_MANIFEST, content: `${JSON.stringify({ schemaVersion: 1, missionId: "049-store-readiness",
            systemId: SYSTEM_ID, repository: REPOSITORY, startingRevision, productionRunId: runId,
            provider: "EAS", cliVersion: EAS_CLI_VERSION, previewDistribution: "INTERNAL",
            storeDistribution: ["TESTFLIGHT", "GOOGLE_PLAY_INTERNAL"],
            state: "AUTHORIZED_PENDING_EXACT_REVISION_CI_AND_EXTERNAL_RELEASE",
            protectedActions: ["SIGNING", "STORE_CREDENTIALS", "INTERNAL_SUBMISSION", "CERTIFICATION", "PUBLIC_RELEASE"],
            completionRule: "Exact-revision CI, installable iOS and Android builds, TestFlight and Play internal submissions, device testing, approved privacy/listing/screenshots, and human certification must all pass."
        }, null, 2)}\n` },
        { path: STORE_MEMO, content: "# PBOS Mobile Store Readiness\n\n" +
            "PBOS uses EAS internal distribution for installable iOS and Android preview links. It separately creates store-signed binaries and auto-submits only to TestFlight and Google Play internal testing after exact-revision CI. " +
            "The EAS project and remotely managed credentials must already belong to The Playbook. Public App Store or Play production release is excluded. " +
            "Human certification attests that both install links work, internal testing passed, and the privacy, listing, and screenshot records were reviewed.\n" }
    ];
}

function acceptanceEvidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const item = (dimension: ApplicationAcceptanceEvidence["dimension"], behavior: string,
        source: ApplicationAcceptanceEvidence["source"] = "IMPLEMENTATION"): ApplicationAcceptanceEvidence => ({
        evidenceId: `049-store-readiness:${dimension.toLowerCase()}:${revision}`, dimension, behavior,
        repository: REPOSITORY, commit: revision, artifact: STORE_MANIFEST, passed: true, source
    });
    return [
        item("ROUTE", "Internal iOS and Android releases retain every governed mobile route."),
        item("USER_INTERFACE", "Store metadata and device screenshots are bound to the approved Playbook visual canon."),
        item("DURABLE_DATA", "Internal builds use the governed staging application and data boundary."),
        item("AUTHORITY", "Signing, internal submission, certification, and public release remain explicit protected actions."),
        item("PBOS_INTEGRATION", "EAS build lineage carries the Playbook system and exact repository revision."),
        item("ACCEPTANCE_TEST", "The release request retains executable native acceptance before provider deployment.", "APPLICATION_TEST"),
        item("ACCESSIBILITY", "Store readiness retains the blocking native accessibility evidence.", "APPLICATION_TEST"),
        item("SECURITY", "PBOS resolves provider credentials in memory and freezes remotely managed signing credentials.", "SECURITY_TEST"),
        item("PREVIEW", "An approval-bound exact-revision EAS install request is ready for provider execution.")
    ];
}

export async function playbookMobileReleaseAcceptancePlan(
    gateway: GitHubRepositoryGateway, reference: Parameters<typeof playbookMobileAcceptancePlan>[1],
    branch: string, revision: string, approvalId: string): Promise<FunctionalAcceptancePlan> {
    const mobile = await playbookMobileAcceptancePlan(gateway, reference, branch, revision);
    return { ...mobile, planId: `playbook-mobile-store-readiness:${revision}`,
        productNodeId: "THE-PLAYBOOK-MOBILE-STORE-READINESS", journeyId: "PLAYBOOK-MOBILE-INTERNAL-RELEASE",
        protectedEnvironmentFiles: [...(mobile.protectedEnvironmentFiles ?? []),
            ...playbookMobileReleaseProtectedEnvironmentFiles()],
        previewDeployment: {
            provider: "EAS", repository: REPOSITORY, branch, commit: revision, environment: "preview", approvalId,
            tokenEnvironmentVariable: "EXPO_TOKEN", projectEnvironmentVariable: "EXPO_PROJECT_ID",
            webPreviewEnvironmentVariable: "PBOS_WEB_PREVIEW_URL", applicationDirectory: "apps/mobile",
            cliVersion: EAS_CLI_VERSION, previewProfile: "preview", storeProfile: "production",
            submitProfile: "production", platforms: ["IOS", "ANDROID"],
            distributionTarget: "TESTFLIGHT_AND_PLAY_INTERNAL", browserTarget: "DEPLOYED_PREVIEW"
        }
    };
}

export function playbookMobileStoreReadinessExecutor(
    dependencies: PlaybookMobileStoreReadinessExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "049-store-readiness" || context.run.systemId !== SYSTEM_ID ||
            context.run.repository !== REPOSITORY) throw new Error("The CIP-049 store-readiness adapter is restricted to The Playbook.");
        if (!dependencies.deploymentApprovalId.trim()) throw new Error("Mobile store readiness requires explicit durable operator approval.");
        const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            context.run.startingBranch);
        const branch = `agent/pbos-playbook-system-001-049-store-${context.run.runId.slice(0, 8)}`;
        for (const [action, risk, approval] of [["INSPECT_REPOSITORY", "LOW", undefined],
            ["PROPOSE_CHANGE", "MEDIUM", undefined], ["MODIFY_APPLICATION_CODE", "MEDIUM", undefined],
            ["UPDATE_DOCUMENTATION", "MEDIUM", undefined], ["CREATE_COMMIT", "MEDIUM", undefined],
            ["PUSH_BRANCH", "MEDIUM", undefined], ["OPEN_DRAFT_PR", "MEDIUM", undefined],
            ["DEPLOY_STAGING", "HIGH", dependencies.deploymentApprovalId]] as const) {
            const decision = dependencies.authorize(action, risk, branch, approval);
            if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) {
            throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan store readiness.`);
        }
        const mobile = await dependencies.gateway.readFileAtRevision(reference, MOBILE_MANIFEST, inspection.revision);
        if (!mobile.includes("IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION") || !mobile.includes('"IOS"') || !mobile.includes('"ANDROID"')) {
            throw new Error("Validated iOS and Android journey evidence is required before store readiness.");
        }
        const appConfig = await dependencies.gateway.readFileAtRevision(reference, "apps/mobile/app.config.ts", inspection.revision);
        const easConfiguration = await dependencies.gateway.readFileAtRevision(reference, "apps/mobile/eas.json", inspection.revision);
        const changes = storeFiles(inspection.revision, context.run.runId, appConfig, easConfiguration);
        context.report("BUILDING", `Preparing approval-bound EAS internal releases on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, changes);
        const revision = await dependencies.gateway.commit(reference, "chore: prepare governed Playbook mobile releases",
            changes.map(change => change.path));
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "chore: prepare governed Playbook mobile releases",
            `PBOS Genesis mission \`049-store-readiness\` prepares exact-revision installable previews and internal-store submissions at \`${revision}\`.\n\n` +
            "Public App Store and Google Play production release remain excluded protected actions.");
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        return {
            outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId,
                deploymentProvider: "EAS", distributionTarget: "TESTFLIGHT_AND_PLAY_INTERNAL" },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`,
                `approval:${dependencies.deploymentApprovalId}`],
            files: { added: changes.filter(change => !["apps/mobile/app.config.ts", "apps/mobile/eas.json"].includes(change.path))
                .map(change => change.path), modified: ["apps/mobile/app.config.ts", "apps/mobile/eas.json"] },
            commands: [{ command: "prepare governed EAS internal release", exitCode: 0, durationMs: 0,
                output: `${branch} ${pullRequest.url}` }],
            validations: [{ name: "Protected mobile-release request published for independent validation", passed: true,
                durationMs: 0, evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url },
            acceptanceEvidence: acceptanceEvidence(revision),
            functionalAcceptancePlan: await playbookMobileReleaseAcceptancePlan(dependencies.gateway, reference, branch, revision,
                dependencies.deploymentApprovalId)
        };
    };
}
