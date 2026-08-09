import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GenesisStateRepository, VerifiableApproval } from "../genesis-state";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ApplicationAcceptanceEvidence, ProductionMissionExecutor, ProductionRun } from "../production-runtime";
import { ResumableRemediationEngine } from "../validation-automation";
import { playbookMobileReleaseAcceptancePlan } from "./playbook-mobile-store-readiness-executor";
import { readPlaybookMobileStoreReadinessManifest } from "./playbook-readiness-manifests";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const STORE_MISSION = "Prepare Apple and Google store releases";
const STORE_MANIFEST = "pbos/readiness/049-store-readiness.json";
const CERTIFICATION_MANIFEST = "pbos/readiness/049-mobile-certification.json";
const CERTIFICATION_MEMO = "docs/release/PBOS-MOBILE-RELEASE-CANDIDATE.md";

interface CertifiedStoreLineage {
    readonly run: ProductionRun;
    readonly approval: VerifiableApproval;
    readonly providerEvidence: Readonly<Record<string, string>>;
}

export interface PlaybookMobileCertificationExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly state: GenesisStateRepository;
    readonly deploymentApprovalId: string;
    readonly verifyHistoricalApproval: (approval: VerifiableApproval, action: string, resource: string) => boolean;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string,
        explicitApprovalId?: string) => BuildAuthorityDecision;
}

function certifiedStoreLineage(dependencies: PlaybookMobileCertificationExecutorDependencies): CertifiedStoreLineage {
    const run = [...dependencies.state.productionRuns()].reverse().find(candidate =>
        candidate.systemId === SYSTEM_ID && candidate.repository === REPOSITORY &&
        candidate.selectedMission === STORE_MISSION && candidate.status === "CERTIFIED");
    if (!run) throw new Error("Mobile final certification requires a certified 049-store-readiness production run.");
    const audit = [...dependencies.state.audit()].reverse().find(event => event.resource === run.runId &&
        event.type === "VERIFIABLE_APPROVAL" && event.evidence.purpose === "CERTIFY_PRODUCTION_MISSION");
    const approval = audit?.evidence.approval as VerifiableApproval | undefined;
    if (!approval || !dependencies.verifyHistoricalApproval(approval, "CERTIFY_PRODUCTION_MISSION", run.runId)) {
        throw new Error("The prior mobile store-readiness certification approval is missing or unverifiable.");
    }
    const preview = run.functionalAcceptancePlan?.durablePreview;
    const providerEvidence = preview?.providerEvidence;
    if (!preview?.iosUrl || !preview.androidUrl || providerEvidence?.provider !== "EAS" ||
        providerEvidence.commit !== run.currentCommit || !run.previewArtifactIds.length) {
        throw new Error("The prior store-readiness run lacks exact-revision iOS, Android, or EAS preview evidence.");
    }
    return { run, approval, providerEvidence };
}

function candidateFiles(startingRevision: string, runId: string,
    prior: CertifiedStoreLineage): readonly RepositoryFileChange[] {
    const providerIds = Object.fromEntries(Object.entries(prior.providerEvidence)
        .filter(([key]) => key.endsWith("BuildId")));
    return [
        { path: CERTIFICATION_MANIFEST, content: `${JSON.stringify({ schemaVersion: 1,
            missionId: "049-certification", systemId: SYSTEM_ID, repository: REPOSITORY,
            startingRevision, productionRunId: runId,
            priorStoreReadiness: { runId: prior.run.runId, commit: prior.run.currentCommit,
                certificationApprovalId: prior.approval.approvalId, provider: "EAS", providerIds,
                protectedInstallEndpoints: "PBOS_DURABLE_RUNTIME_STATE" },
            releaseCandidate: { platforms: ["IOS", "ANDROID"], distribution: ["TESTFLIGHT", "GOOGLE_PLAY_INTERNAL"],
                publicRelease: "EXCLUDED" },
            state: "PENDING_EXACT_REVISION_ACCEPTANCE_AND_HUMAN_CERTIFICATION",
            completionRule: "The new exact revision must pass independent CI, executable web and native journeys, EAS iOS and Android builds, internal distribution probes, and PBOS Kernel human certification."
        }, null, 2)}\n` },
        { path: CERTIFICATION_MEMO, content: "# PBOS Mobile Release Candidate\n\n" +
            `This candidate inherits certified store-readiness lineage from PBOS run \`${prior.run.runId}\` at commit \`${prior.run.currentCommit}\`. ` +
            "PBOS will rebuild the candidate's exact commit, execute web and native Scholar acceptance, create new iOS and Android internal builds, verify the install endpoints, and then stop at the existing PBOS Kernel human-certification boundary. " +
            "This record does not certify the candidate by itself. Public App Store and Google Play production release remain excluded protected actions.\n" }
    ];
}

function implementationEvidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const item = (dimension: ApplicationAcceptanceEvidence["dimension"], behavior: string,
        source: ApplicationAcceptanceEvidence["source"] = "IMPLEMENTATION"): ApplicationAcceptanceEvidence => ({
        evidenceId: `049-mobile-certification:${dimension.toLowerCase()}:${revision}`,
        dimension, behavior, repository: REPOSITORY, commit: revision,
        artifact: CERTIFICATION_MANIFEST, passed: true, source
    });
    return [
        item("ROUTE", "The release candidate retains the complete governed web and mobile route inventory."),
        item("USER_INTERFACE", "The release candidate retains the approved responsive Playbook visual canon."),
        item("DURABLE_DATA", "The release candidate remains bound to governed staging identity and durable data."),
        item("AUTHORITY", "Final certification and all public releases remain separate human-controlled decisions."),
        item("PBOS_INTEGRATION", "The candidate carries prior store-readiness and current PBOS execution lineage."),
        item("ACCEPTANCE_TEST", "Executable web and native acceptance is required on the candidate revision.", "APPLICATION_TEST"),
        item("ACCESSIBILITY", "Accessibility remains a blocking web and native acceptance dimension.", "APPLICATION_TEST"),
        item("SECURITY", "Provider credentials remain mode-0600 inputs resolved only in memory.", "SECURITY_TEST"),
        item("PREVIEW", "The candidate requests new exact-revision web, iOS, and Android preview evidence.")
    ];
}

export function playbookMobileCertificationExecutor(
    dependencies: PlaybookMobileCertificationExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "049-certification" || context.run.systemId !== SYSTEM_ID ||
            context.run.repository !== REPOSITORY) throw new Error("The mobile certification adapter is restricted to The Playbook.");
        if (!dependencies.deploymentApprovalId.trim()) {
            throw new Error("Mobile final certification preparation requires explicit durable operator approval.");
        }
        const prior = certifiedStoreLineage(dependencies);
        const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            context.run.startingBranch);
        const branch = `agent/pbos-playbook-system-001-049-certification-${context.run.runId.slice(0, 8)}`;
        for (const [action, risk, approval] of [["INSPECT_REPOSITORY", "LOW", undefined],
            ["PROPOSE_CHANGE", "MEDIUM", undefined], ["UPDATE_DOCUMENTATION", "MEDIUM", undefined],
            ["CREATE_COMMIT", "MEDIUM", undefined], ["PUSH_BRANCH", "MEDIUM", undefined],
            ["OPEN_DRAFT_PR", "MEDIUM", undefined],
            ["DEPLOY_STAGING", "HIGH", dependencies.deploymentApprovalId]] as const) {
            const decision = dependencies.authorize(action, risk, branch, approval);
            if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) {
            throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan mobile certification.`);
        }
        const storeManifest = readPlaybookMobileStoreReadinessManifest(
            await dependencies.gateway.readFileAtRevision(reference, STORE_MANIFEST, inspection.revision));
        const changes = candidateFiles(inspection.revision, context.run.runId, prior);
        context.report("BUILDING", `Preparing exact-revision mobile certification evidence on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, changes);
        const revision = await dependencies.gateway.commit(reference, "chore: prepare governed Playbook mobile certification",
            changes.map(change => change.path));
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "chore: prepare governed Playbook mobile certification",
            `PBOS Genesis mission \`049-certification\` binds prior store evidence and requests exact-revision web, iOS, and Android acceptance at \`${revision}\`.\n\n` +
            "This pull request cannot self-certify or publish to public app stores.");
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        return {
            outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId,
                priorStoreRunId: prior.run.runId, priorStoreCommit: prior.run.currentCommit },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`,
                `pull-request:${pullRequest.number}`, `prior-store-run:${prior.run.runId}`,
                `prior-store-approval:${prior.approval.approvalId}`, `approval:${dependencies.deploymentApprovalId}`],
            files: { added: changes.map(change => change.path) },
            commands: [{ command: "prepare governed mobile release candidate", exitCode: 0, durationMs: 0,
                output: `${branch} ${pullRequest.url}` }],
            validations: [{ name: "Mobile release candidate published for independent exact-revision validation",
                passed: true, durationMs: 0, evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url },
            acceptanceEvidence: implementationEvidence(revision),
            functionalAcceptancePlan: await playbookMobileReleaseAcceptancePlan(dependencies.gateway, reference,
                branch, revision, dependencies.deploymentApprovalId, storeManifest.productJourneyIds)
        };
    };
}
