import { GitHubRepositoryGateway, RepositoryReference } from "../platform";
import { BrowserJourneyPlan, FunctionalAcceptancePlan, FunctionalRuntimeProbe } from "../production-runtime";
import { playbookAcademicAcceptancePlan } from "./playbook-academic-functional-acceptance";
import { PlaybookConnectedJourneyMission, playbookConnectedJourneyAcceptancePlan } from "./playbook-connected-journey-functional-acceptance";
import { PLAYBOOK_SCHOLAR_ACCEPTANCE_ENVIRONMENT, playbookScholarAcceptancePlan } from "./playbook-functional-acceptance";

const PRODUCT_PORT = 4317;
const PRODUCT_BASE_URL = `http://127.0.0.1:${PRODUCT_PORT}`;
const connectedMissionByJourneyId: Readonly<Record<string, PlaybookConnectedJourneyMission>> = {
    "READINESS-TO-OPPORTUNITY": "048-opportunity-journey",
    "OPPORTUNITY-TO-APPLICATION": "048-application-journey",
    "APPLICATION-TO-AUTHORIZED-SUPPORT": "048-support-journey",
    "AUTHORIZED-SUPPORT-MESSAGING": "048-messaging-journey",
    "EVENT-TO-ACKNOWLEDGED-NOTIFICATION": "048-notification-journey"
};
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
    reference: RepositoryReference, branch: string, revision: string,
    declaredJourneyIds: readonly string[],
    specificationByJourneyId: ReadonlyMap<string, string> = new Map()): Promise<FunctionalAcceptancePlan> {
    if (!declaredJourneyIds.length) throw new Error("Connected Playbook product acceptance requires at least one declared journey.");
    if (unique(declaredJourneyIds).length !== declaredJourneyIds.length) {
        throw new Error("Connected Playbook product acceptance requires unique declared journey IDs.");
    }
    const plans = await Promise.all(declaredJourneyIds.map(async journeyId => {
        if (journeyId === "SCHOLAR-ONBOARDING-TO-DASHBOARD") {
            return playbookScholarAcceptancePlan(gateway, reference, branch, revision);
        }
        if (journeyId === "TRANSCRIPT-TO-ACADEMIC-READINESS") {
            return playbookAcademicAcceptancePlan(gateway, reference, branch, revision);
        }
        const missionId = connectedMissionByJourneyId[journeyId];
        if (!missionId) {
            const specificationPath = specificationByJourneyId.get(journeyId);
            if (!specificationPath) {
                throw new Error(`Unsupported Playbook product journey declared for runtime acceptance: ${journeyId}`);
            }
            const artifactPrefix = journeyId.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const dynamicPlan: FunctionalAcceptancePlan = {
                planId: `playbook-${artifactPrefix}-acceptance:${revision}`,
                systemId: "PLAYBOOK-SYSTEM-001",
                productNodeId: `PLAYBOOK-${journeyId}`,
                journeyId,
                repository: "sgwalton87/playbook-platform",
                branch,
                commit: revision,
                workingDirectory: "",
                prerequisites: [
                    { command: "npm", args: ["ci", "--no-audit", "--no-fund"], timeoutMs: 900_000 },
                    { command: "npm", args: ["run", "pbos:acceptance:prepare"], timeoutMs: 300_000 }
                ],
                launch: {
                    command: "npm",
                    args: ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(PRODUCT_PORT)],
                    baseUrl: PRODUCT_BASE_URL,
                    healthPath: "/login",
                    startupTimeoutMs: 120_000,
                    requiredEnvironmentVariables: PLAYBOOK_SCHOLAR_ACCEPTANCE_ENVIRONMENT
                },
                probes: [{
                    probeId: `${artifactPrefix}-route`,
                    dimension: "ROUTE",
                    behavior: `Journey ${journeyId} route checks are declared in ${specificationPath}.`,
                    path: "/",
                    expectedStatus: 200
                }],
                browserJourneys: [{
                    journeyId,
                    persona: "SCHOLAR",
                    behavior: `Execute governed product journey contract for ${journeyId}.`,
                    route: "/",
                    engine: "PLAYWRIGHT",
                    command: {
                        command: "npx",
                        args: ["playwright", "test", specificationPath, "--project=chromium"],
                        publicEnvironment: {
                            PLAYWRIGHT_BASE_URL: PRODUCT_BASE_URL,
                            PBOS_ACCEPTANCE_COMMIT: revision
                        },
                        timeoutMs: 300_000
                    },
                    viewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
                    screenshotArtifacts: [
                        `artifacts/pbos-acceptance/${artifactPrefix}-desktop.png`,
                        `artifacts/pbos-acceptance/${artifactPrefix}-mobile.png`
                    ],
                    traceArtifact: `artifacts/pbos-acceptance/${artifactPrefix}-trace.zip`,
                    accessibilityArtifact: `artifacts/pbos-acceptance/${artifactPrefix}-accessibility.json`,
                    acceptanceArtifact: `artifacts/pbos-acceptance/${artifactPrefix}-acceptance.json`,
                    verifiedDimensions: ["DURABLE_DATA", "PBOS_INTEGRATION", "AUTHORITY", "SECURITY"]
                }]
            };
            return dynamicPlan;
        }
        return playbookConnectedJourneyAcceptancePlan(gateway, reference, branch, revision, missionId);
    }));
    const scholar = plans[0];
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
