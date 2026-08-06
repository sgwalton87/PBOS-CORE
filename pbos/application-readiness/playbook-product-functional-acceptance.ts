import { GitHubRepositoryGateway, RepositoryReference } from "../platform";
import { BrowserJourneyPlan, FunctionalAcceptancePlan, FunctionalRuntimeProbe } from "../production-runtime";
import { playbookAcademicAcceptancePlan } from "./playbook-academic-functional-acceptance";
import { PlaybookConnectedJourneyMission, playbookConnectedJourneyAcceptancePlan } from "./playbook-connected-journey-functional-acceptance";
import { PLAYBOOK_SCHOLAR_ACCEPTANCE_ENVIRONMENT, playbookScholarAcceptancePlan } from "./playbook-functional-acceptance";

const PRODUCT_PORT = 4317;
const PRODUCT_BASE_URL = `http://127.0.0.1:${PRODUCT_PORT}`;
const connectedMissions: readonly PlaybookConnectedJourneyMission[] = [
    "048-opportunity-journey",
    "048-application-journey",
    "048-support-journey",
    "048-messaging-journey",
    "048-notification-journey"
];

function unique<T>(values: readonly T[]): readonly T[] { return [...new Set(values)]; }

function normalizeJourney(journey: BrowserJourneyPlan, revision: string): BrowserJourneyPlan {
    return { ...journey, command: { ...journey.command,
        publicEnvironment: { ...(journey.command.publicEnvironment ?? {}),
            PLAYWRIGHT_BASE_URL: PRODUCT_BASE_URL, PBOS_ACCEPTANCE_COMMIT: revision } } };
}

/**
 * Runs every certified Playbook web journey against one application process and
 * one exact repository revision. Individual adapters remain the owners of their
 * journey contracts; this plan composes them without creating a second runtime.
 */
export async function playbookProductAcceptancePlan(gateway: GitHubRepositoryGateway,
    reference: RepositoryReference, branch: string, revision: string): Promise<FunctionalAcceptancePlan> {
    const [scholar, academic, ...connected] = await Promise.all([
        playbookScholarAcceptancePlan(gateway, reference, branch, revision),
        playbookAcademicAcceptancePlan(gateway, reference, branch, revision),
        ...connectedMissions.map(missionId => playbookConnectedJourneyAcceptancePlan(gateway, reference, branch, revision, missionId))
    ]);
    const plans = [scholar, academic, ...connected];
    const requiredEnvironmentVariables = unique(plans.flatMap(plan => [
        ...(plan.launch.requiredEnvironmentVariables ?? []),
        ...plan.browserJourneys.flatMap(journey => journey.command.requiredEnvironmentVariables ?? [])
    ]));
    const probes: FunctionalRuntimeProbe[] = plans.flatMap(plan => plan.probes);
    const browserJourneys = plans.flatMap(plan => plan.browserJourneys).map(journey => normalizeJourney(journey, revision));
    return {
        planId: `playbook-connected-product-acceptance:${revision}`,
        systemId: "PLAYBOOK-SYSTEM-001",
        productNodeId: "THE-PLAYBOOK-CONNECTED-PRODUCT",
        journeyId: "CONNECTED-PLAYBOOK-PRODUCT",
        repository: "sgwalton87/playbook-platform",
        branch,
        commit: revision,
        workingDirectory: scholar.workingDirectory,
        protectedEnvironmentFiles: scholar.protectedEnvironmentFiles,
        prerequisites: scholar.prerequisites,
        minimumFreeBytes: scholar.minimumFreeBytes,
        launch: {
            command: "npm",
            args: ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(PRODUCT_PORT)],
            baseUrl: PRODUCT_BASE_URL,
            healthPath: "/login",
            startupTimeoutMs: 120_000,
            requiredEnvironmentVariables: unique([...PLAYBOOK_SCHOLAR_ACCEPTANCE_ENVIRONMENT, ...requiredEnvironmentVariables])
        },
        probes,
        browserJourneys
    };
}
