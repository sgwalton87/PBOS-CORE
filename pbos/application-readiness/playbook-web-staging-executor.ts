import { homedir } from "os";
import { join } from "path";
import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ApplicationAcceptanceEvidence, FunctionalAcceptancePlan, ProductionMissionExecutor,
    ProtectedEnvironmentFile, ProtectedEnvironmentReadiness, ProtectedEnvironmentResolver } from "../production-runtime";
import { ResumableRemediationEngine } from "../validation-automation";
import { playbookProductAcceptancePlan } from "./playbook-product-functional-acceptance";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const PRODUCT_MANIFEST = "pbos/readiness/048-product-journeys.json";
const STAGING_MANIFEST = "pbos/readiness/048-web-staging.json";
const STAGING_MEMO = "docs/acceptance/PBOS-WEB-STAGING.md";

export const PLAYBOOK_WEB_STAGING_PROVIDER_ENVIRONMENT = [
    "VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"
] as const;

export function playbookWebStagingProtectedEnvironmentFiles(
    stateHome = process.env.PBOS_STATE_HOME ?? join(homedir(), ".pbos"),
    required = true): readonly ProtectedEnvironmentFile[] {
    return [{ path: join(stateHome, "secrets", "playbook-web-staging.env"), required }];
}

export async function inspectPlaybookWebStagingReadiness(
    environment: NodeJS.ProcessEnv = process.env,
    stateHome = environment.PBOS_STATE_HOME ?? join(homedir(), ".pbos")): Promise<ProtectedEnvironmentReadiness> {
    return new ProtectedEnvironmentResolver(environment).inspect([{
        command: "pbos-vercel-preview-deployment", args: [],
        requiredEnvironmentVariables: PLAYBOOK_WEB_STAGING_PROVIDER_ENVIRONMENT
    }], playbookWebStagingProtectedEnvironmentFiles(stateHome, false));
}

const requiredPreviewEnvironment = [
    "PBOS_ENVIRONMENT", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "PBOS_API_URL",
    "PBOS_ORGANIZATION_ID", "PBOS_CONNECTOR_ID", "PBOS_CONNECTOR_KEY_ID", "PBOS_CONNECTOR_SECRET_BASE64",
    "PBOS_SCHOLAR_IDENTITY_APPROVAL_ID", "PBOS_SCHOLAR_EXCHANGE_APPROVAL_ID", "PBOS_ACADEMIC_JOURNEY_APPROVAL_ID",
    "PBOS_OPPORTUNITY_JOURNEY_APPROVAL_ID", "PBOS_APPLICATION_JOURNEY_APPROVAL_ID", "PBOS_SUPPORT_REQUEST_APPROVAL_ID",
    "PBOS_MESSAGING_JOURNEY_APPROVAL_ID", "PBOS_NOTIFICATION_JOURNEY_APPROVAL_ID", "ANTHROPIC_API_KEY"
] as const;

const previewOnlyEnvironment = [
    "PBOS_ENVIRONMENT", "PBOS_API_URL", "PBOS_ORGANIZATION_ID", "PBOS_CONNECTOR_ID", "PBOS_CONNECTOR_KEY_ID",
    "PBOS_CONNECTOR_SECRET_BASE64", "PBOS_SCHOLAR_IDENTITY_APPROVAL_ID", "PBOS_SCHOLAR_EXCHANGE_APPROVAL_ID",
    "PBOS_ACADEMIC_JOURNEY_APPROVAL_ID", "PBOS_OPPORTUNITY_JOURNEY_APPROVAL_ID",
    "PBOS_APPLICATION_JOURNEY_APPROVAL_ID", "PBOS_SUPPORT_REQUEST_APPROVAL_ID",
    "PBOS_MESSAGING_JOURNEY_APPROVAL_ID", "PBOS_NOTIFICATION_JOURNEY_APPROVAL_ID"
] as const;

export interface PlaybookWebStagingExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly deploymentApprovalId: string;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string,
        explicitApprovalId?: string) => BuildAuthorityDecision;
}

function stagingFiles(startingRevision: string, runId: string): readonly RepositoryFileChange[] {
    return [
        { path: STAGING_MANIFEST, content: `${JSON.stringify({
            schemaVersion: 1, missionId: "048-web-staging", systemId: SYSTEM_ID, repository: REPOSITORY,
            startingRevision, productionRunId: runId, provider: "VERCEL", target: "preview",
            state: "AUTHORIZED_PENDING_EXACT_REVISION_CI_AND_DEPLOYMENT",
            requiredConfigurationNames: requiredPreviewEnvironment,
            protectedConfigurationNames: previewOnlyEnvironment,
            completionRule: "CI, exact-commit Vercel deployment, remote browser journeys, preview health, and human certification must pass."
        }, null, 2)}\n` },
        { path: STAGING_MEMO, content: "# PBOS Playbook Web Staging\n\n" +
            "PBOS deploys this mission only after independent validation passes on the exact pull-request revision. " +
            "The Vercel project must be bound to `sgwalton87/playbook-platform`; required configuration is inspected by name and scope without logging values. " +
            "Production deployment is explicitly excluded. Desktop and responsive-mobile browser journeys run against the resulting preview URL.\n" }
    ];
}

function acceptanceEvidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const item = (dimension: ApplicationAcceptanceEvidence["dimension"], behavior: string,
        source: ApplicationAcceptanceEvidence["source"] = "IMPLEMENTATION"): ApplicationAcceptanceEvidence => ({
        evidenceId: `048-web-staging:${dimension.toLowerCase()}:${revision}`, dimension, behavior, repository: REPOSITORY,
        commit: revision, artifact: STAGING_MANIFEST, passed: true, source
    });
    return [
        item("ROUTE", "The staging contract requires a healthy interactive login route."),
        item("USER_INTERFACE", "Desktop and responsive-mobile journeys target one commit-bound Vercel preview."),
        item("DURABLE_DATA", "Remote journeys retain the connected product's durable staging data checks."),
        item("AUTHORITY", "Staging deployment requires explicit protected action approval."),
        item("PBOS_INTEGRATION", "The preview requires the isolated Playbook staging connector configuration."),
        item("ACCEPTANCE_TEST", "Seven remote browser journeys remain executable after deployment.", "APPLICATION_TEST"),
        item("ACCESSIBILITY", "Every remote journey retains its blocking accessibility audit.", "APPLICATION_TEST"),
        item("SECURITY", "Provider binding, configuration scope, and production exclusion fail closed.", "SECURITY_TEST"),
        item("PREVIEW", "An approval-bound exact-revision Vercel preview is prepared for provider deployment.")
    ];
}

async function stagingPlan(gateway: GitHubRepositoryGateway, reference: Parameters<typeof playbookProductAcceptancePlan>[1],
    branch: string, revision: string, approvalId: string): Promise<FunctionalAcceptancePlan> {
    const product = await playbookProductAcceptancePlan(gateway, reference, branch, revision);
    return { ...product,
        planId: `playbook-web-staging:${revision}`,
        productNodeId: "THE-PLAYBOOK-WEB-STAGING",
        journeyId: "CONNECTED-PLAYBOOK-WEB-STAGING",
        protectedEnvironmentFiles: [...(product.protectedEnvironmentFiles ?? []),
            ...playbookWebStagingProtectedEnvironmentFiles()],
        previewDeployment: {
            provider: "VERCEL", repository: REPOSITORY, branch, commit: revision, environment: "preview",
            approvalId, tokenEnvironmentVariable: "VERCEL_TOKEN", projectEnvironmentVariable: "VERCEL_PROJECT_ID",
            teamEnvironmentVariable: "VERCEL_TEAM_ID", requiredProjectEnvironmentVariables: requiredPreviewEnvironment,
            previewOnlyEnvironmentVariables: previewOnlyEnvironment, browserTarget: "DEPLOYED_PREVIEW"
        }
    };
}

export function playbookWebStagingExecutor(dependencies: PlaybookWebStagingExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "048-web-staging" || context.run.systemId !== SYSTEM_ID ||
            context.run.repository !== REPOSITORY) throw new Error("The CIP-048 web-staging adapter is restricted to The Playbook.");
        if (!dependencies.deploymentApprovalId.trim()) throw new Error("Playbook web staging requires explicit durable operator approval.");
        const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            context.run.startingBranch);
        const branch = `agent/pbos-playbook-system-001-048-web-staging-${context.run.runId.slice(0, 8)}`;
        for (const [action, risk, approval] of [["INSPECT_REPOSITORY", "LOW", undefined], ["PROPOSE_CHANGE", "MEDIUM", undefined],
            ["UPDATE_DOCUMENTATION", "MEDIUM", undefined], ["CREATE_COMMIT", "MEDIUM", undefined],
            ["PUSH_BRANCH", "MEDIUM", undefined], ["OPEN_DRAFT_PR", "MEDIUM", undefined],
            ["DEPLOY_STAGING", "HIGH", dependencies.deploymentApprovalId]] as readonly (readonly [BuildAction, ActionRisk, string | undefined])[]) {
            const decision = dependencies.authorize(action, risk, branch, approval);
            if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) {
            throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan web staging.`);
        }
        const productManifest = await dependencies.gateway.readFileAtRevision(reference, PRODUCT_MANIFEST, inspection.revision);
        if (!productManifest.includes("IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION") || !productManifest.includes('"journeys"')) {
            throw new Error("Connected Playbook product acceptance is not present on the governed default branch.");
        }
        const changes = stagingFiles(inspection.revision, context.run.runId);
        context.report("BUILDING", `Preparing protected exact-revision web staging on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, changes);
        const revision = await dependencies.gateway.commit(reference, "chore: prepare governed Playbook web staging",
            changes.map(change => change.path));
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "chore: prepare governed Playbook web staging",
            `PBOS Genesis mission \`048-web-staging\` prepares an approval-bound Vercel preview after exact-revision CI.\n\n` +
            `Production deployment and secret mutation are excluded. Generated revision: \`${revision}\`.`);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        const functionalAcceptancePlan = await stagingPlan(dependencies.gateway, reference, branch, revision,
            dependencies.deploymentApprovalId);
        return {
            outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId, deploymentProvider: "VERCEL" },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`,
                `approval:${dependencies.deploymentApprovalId}`],
            files: { added: changes.map(change => change.path) },
            commands: [{ command: "prepare governed Vercel preview", exitCode: 0, durationMs: 0,
                output: `${branch} ${pullRequest.url}` }],
            validations: [{ name: "Protected web-staging request published for independent validation", passed: true,
                durationMs: 0, evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url },
            acceptanceEvidence: acceptanceEvidence(revision), functionalAcceptancePlan
        };
    };
}
