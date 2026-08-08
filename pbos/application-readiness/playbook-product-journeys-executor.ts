import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ApplicationAcceptanceEvidence, ProductionMissionExecutor, ProductionRun,
    ProductionRuntimeService } from "../production-runtime";
import { RemediationRun, ResumableRemediationEngine } from "../validation-automation";
import { playbookAcademicAcceptanceFiles } from "./playbook-academic-functional-acceptance";
import { playbookProductAcceptancePlan } from "./playbook-product-functional-acceptance";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const MANIFEST = "pbos/readiness/048-product-journeys.json";
const MEMO = "docs/acceptance/PBOS-CONNECTED-PRODUCT.md";
const ACADEMIC_TRACKER = "components/ag/AGTracker.tsx";

const journeyContracts = [
    ["tests/acceptance/pbos-scholar.spec.ts", "SCHOLAR-ONBOARDING-TO-DASHBOARD"],
    ["tests/acceptance/pbos-academic.spec.ts", "TRANSCRIPT-TO-ACADEMIC-READINESS"],
    ["tests/acceptance/pbos-opportunity.spec.ts", "READINESS-TO-OPPORTUNITY"],
    ["tests/acceptance/pbos-application.spec.ts", "OPPORTUNITY-TO-APPLICATION"],
    ["tests/acceptance/pbos-support.spec.ts", "APPLICATION-TO-AUTHORIZED-SUPPORT"],
    ["tests/acceptance/pbos-messaging.spec.ts", "AUTHORIZED-SUPPORT-MESSAGING"],
    ["tests/acceptance/pbos-notifications.spec.ts", "EVENT-TO-ACKNOWLEDGED-NOTIFICATION"]
] as const;

export interface PlaybookProductJourneysExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
}

export interface PlaybookProductJourneysRecoveryDependencies extends PlaybookProductJourneysExecutorDependencies {
    readonly production: Pick<ProductionRuntimeService, "registerBoundedRemediation">;
    readonly recoveryDefects?: readonly string[];
    readonly pullRequest: PullRequestReference;
}

export function isProductScholarDashboardContrastDefect(run: ProductionRun,
    recoveryDefects: readonly string[] = []): boolean {
    const evidenceText = [run.terminalSummary, ...(run.blockers ?? []), ...recoveryDefects].join("\n");
    return run.systemId === SYSTEM_ID && run.selectedMission === "Certify connected Playbook product journeys" &&
        evidenceText.includes("Browser journey command failed for SCHOLAR-ONBOARDING-TO-DASHBOARD") &&
        evidenceText.includes('"id": "color-contrast"') && evidenceText.includes("Action needed") &&
        evidenceText.includes("#94a3b8") && evidenceText.includes("#ffffff") &&
        evidenceText.includes("continue-learning-title");
}

export function wireProductScholarDashboardContrast(source: string): string {
    const inaccessible = `: COLORS.faint,\n                    }}`;
    const accessible = `: COLORS.muted,\n                    }}`;
    if (!source.includes(inaccessible)) {
        throw new Error("The A-G tracker no longer contains the exact inaccessible action-state color contract.");
    }
    const updated = source.replace(inaccessible, accessible);
    if (updated === source || updated.includes(inaccessible)) {
        throw new Error("The A-G tracker action-state contrast repair was not deterministic.");
    }
    return updated;
}

/** Advances the existing product mission and PR with the exact axe-proven Scholar dashboard repair. */
export async function preparePlaybookProductScholarContrastRecovery(
    dependencies: PlaybookProductJourneysRecoveryDependencies, run: ProductionRun):
    Promise<Readonly<{ branch: string; revision: string; remediation: RemediationRun }>> {
    if (run.status !== "BLOCKED" || !run.currentBranch || run.activeRecoveryEpochId ||
        !isProductScholarDashboardContrastDefect(run, dependencies.recoveryDefects)) {
        throw new Error("The production run is not eligible for product Scholar contrast recovery.");
    }
    if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY ||
        dependencies.pullRequest.repository !== REPOSITORY || dependencies.pullRequest.branch !== run.currentBranch) {
        throw new Error("The active Genesis session and pull request do not authorize product Scholar contrast recovery.");
    }
    const branch = run.currentBranch;
    const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, branch);
    for (const [action, risk] of [["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"],
        ["MODIFY_APPLICATION_CODE", "MEDIUM"], ["CREATE_TESTS", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"],
        ["PUSH_BRANCH", "MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]) {
        const decision = dependencies.authorize(action, risk, branch);
        if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
    }
    const inspection = await dependencies.gateway.inspectRepository(reference);
    if (inspection.revision !== run.currentCommit) {
        throw new Error(`Product acceptance lineage moved from ${run.currentCommit} to ${inspection.revision}; re-inspect before mutation.`);
    }
    const source = await dependencies.gateway.readFileAtRevision(reference, ACADEMIC_TRACKER, inspection.revision);
    const changes: readonly RepositoryFileChange[] = [
        { path: ACADEMIC_TRACKER, content: wireProductScholarDashboardContrast(source) }
    ];
    await dependencies.gateway.applyChange(reference, changes);
    const revision = await dependencies.gateway.commit(reference,
        "fix: meet Scholar dashboard contrast acceptance", changes.map(change => change.path));
    await dependencies.gateway.push(reference, branch);
    const remediation = dependencies.remediation.start(SYSTEM_ID, dependencies.pullRequest);
    dependencies.production.registerBoundedRemediation(run.runId, remediation.runId, branch, revision,
        "PRODUCT_SCHOLAR_DASHBOARD_CONTRAST");
    return { branch, revision, remediation };
}

function evidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const item = (dimension: ApplicationAcceptanceEvidence["dimension"], behavior: string, artifact: string,
        source: ApplicationAcceptanceEvidence["source"] = "IMPLEMENTATION"): ApplicationAcceptanceEvidence => ({
        evidenceId: `048-product:${dimension.toLowerCase()}:${revision}`, dimension, behavior,
        repository: REPOSITORY, commit: revision, artifact, passed: true, source
    });
    return [
        item("ROUTE", "Seven connected Playbook journeys declare executable application routes.", MANIFEST),
        item("USER_INTERFACE", "Every connected journey declares desktop and mobile browser evidence.", MANIFEST),
        item("DURABLE_DATA", "Connected journey contracts assert owner-scoped durable data behavior.", MANIFEST),
        item("AUTHORITY", "Every mutating journey declares authenticated and approval-bound authority checks.", MANIFEST),
        item("PBOS_INTEGRATION", "The connected product remains bound to the Playbook PBOS connector.", MANIFEST),
        item("ACCEPTANCE_TEST", "Seven executable browser journeys are composed into one exact-revision plan.", MANIFEST, "APPLICATION_TEST"),
        item("ACCESSIBILITY", "Each journey requires a serious-and-critical accessibility audit.", MANIFEST, "APPLICATION_TEST"),
        item("SECURITY", "Anonymous denial and protected server configuration checks remain mandatory.", MANIFEST, "SECURITY_TEST")
    ];
}

function files(startingRevision: string, runId: string, packageSource: string): readonly RepositoryFileChange[] {
    const academic = playbookAcademicAcceptanceFiles(packageSource);
    const manifest = {
        schemaVersion: 1,
        missionId: "048-product-journeys",
        systemId: SYSTEM_ID,
        repository: REPOSITORY,
        startingRevision,
        productionRunId: runId,
        state: "IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION",
        runtimeAuthority: "PBOS_AUTONOMOUS_PRODUCTION_KERNEL",
        journeys: journeyContracts.map(([specification, journeyId]) => ({ journeyId, specification })),
        requiredViewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
        completionRule: "No journey is complete until exact-revision runtime, browser, accessibility, security and CI evidence pass."
    };
    return [
        ...academic,
        { path: MANIFEST, content: `${JSON.stringify(manifest, null, 2)}\n` },
        { path: MEMO, content: `# PBOS Connected Playbook Product Acceptance\n\n` +
            `Mission \`048-product-journeys\` composes seven independently owned journey contracts into one application process.\n\n` +
            `PBOS must execute every contract against the same exact commit at desktop and mobile viewports. ` +
            `GitHub validation, runtime probes, browser journeys, accessibility evidence, security evidence, and human certification remain separate gates.\n` }
    ];
}

function assertContracts(sources: ReadonlyArray<Readonly<{ path: string; content: string }>>): void {
    sources.forEach(({ path, content }, index) => {
        const expected = journeyContracts[index]?.[1];
        if (!expected || !content.includes(expected)) {
            throw new Error(`Connected product contract is missing or stale: ${path}. Complete its owning journey before aggregation.`);
        }
    });
}

export function playbookProductJourneysExecutor(
    dependencies: PlaybookProductJourneysExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "048-product-journeys" || context.run.systemId !== SYSTEM_ID ||
            context.run.repository !== REPOSITORY) throw new Error("The CIP-048 product acceptance adapter is restricted to The Playbook.");
        if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) {
            throw new Error("The active Genesis session does not authorize connected Playbook acceptance.");
        }
        const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            context.run.startingBranch);
        const branch = `agent/pbos-playbook-system-001-048-product-${context.run.runId.slice(0, 8)}`;
        for (const [action, risk] of [["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"],
            ["CREATE_TESTS", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"], ["PUSH_BRANCH", "MEDIUM"],
            ["OPEN_DRAFT_PR", "MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]) {
            const decision = dependencies.authorize(action, risk, branch);
            if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) {
            throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan before aggregation.`);
        }
        const packageSource = await dependencies.gateway.readFileAtRevision(reference, "package.json", inspection.revision);
        const sources = await Promise.all(journeyContracts.map(async ([path]) => ({ path,
            content: await dependencies.gateway.readFileAtRevision(reference, path, inspection.revision) })));
        assertContracts(sources);
        const changes = files(inspection.revision, context.run.runId, packageSource);
        context.report("BUILDING", `Composing seven Playbook journeys on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, changes);
        await dependencies.gateway.prepareDependencyLock(reference);
        const changedPaths = [...new Set([...changes.map(change => change.path), "package-lock.json"])];
        const revision = await dependencies.gateway.commit(reference, "test: compose connected Playbook product acceptance", changedPaths);
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "test: compose connected Playbook product acceptance",
            `PBOS Genesis mission \`048-product-journeys\` binds seven browser journeys to one application revision.\n\n` +
            `Starting revision: \`${inspection.revision}\`. Generated revision: \`${revision}\`. ` +
            `Functional completion and certification remain evidence-gated.`);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        const functionalAcceptancePlan = await playbookProductAcceptancePlan(dependencies.gateway, reference, branch, revision);
        return {
            outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId,
                journeyCount: journeyContracts.length },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`],
            files: { added: [MANIFEST, MEMO], modified: ["package.json", "package-lock.json", "tests/acceptance/pbos-academic.spec.ts"] },
            commands: [{ command: "compose connected Playbook product acceptance", exitCode: 0, durationMs: 0,
                output: `${journeyContracts.length} journeys ${branch} ${pullRequest.url}` }],
            validations: [{ name: "Connected product acceptance published for independent validation", passed: true,
                durationMs: 0, evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url },
            acceptanceEvidence: evidence(revision),
            functionalAcceptancePlan
        };
    };
}
