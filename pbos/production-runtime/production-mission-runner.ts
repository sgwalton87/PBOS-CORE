import { hostname } from "node:os";
import type { HostedExecutionDependencies, HostedExecutionLease } from "./hosted-approved-mission";
import {
    verifyHostedMissionApproval, verifyPlanReadyRecoveryApproval, type PlanReadyRecoveryAuthorization,
    type HostedMissionScope, type SignedHostedMissionApproval
} from "./hosted-signed-mission-approval";
import type { GitHubAppPlaybookPrApi } from "./github-app-playbook-pr-api";
import { createHash, randomUUID } from "crypto";
import { GenesisStateRepository } from "../genesis-state";
import { GovernedMissionQueue } from "./mission-queue";
import { ApplicationAcceptanceEvidence, DisposableProductionAttempt, FunctionalAcceptancePlan, MissionQueueItem, ProductionExecutionPlan, ProductionRun } from "./contracts";
import { FunctionalAcceptanceVerifier } from "./functional-acceptance-verifier";
import { ProductionRuntimeService } from "./production-runtime-service";

export interface MissionExecutionContext {
    readonly run: ProductionRun;
    readonly mission: MissionQueueItem;
    readonly report: (stage: string, message: string) => void;
}

export interface MissionExecutionResult {
    readonly outputs: Readonly<Record<string, unknown>>;
    readonly evidenceIds: readonly string[];
    readonly files?: Readonly<{ added?: readonly string[]; modified?: readonly string[]; deleted?: readonly string[] }>;
    readonly commands?: readonly Readonly<{ command: string; exitCode: number; durationMs: number; output?: string }>[];
    readonly validations: readonly Readonly<{ name: string; passed: boolean; durationMs: number; evidenceId: string }>[];
    readonly deferredValidation?: Readonly<{ remediationRunId: string; pullRequestUrl: string }>;
    readonly evidenceNeedsIndependentReview?: boolean;
    readonly acceptanceEvidence?: readonly ApplicationAcceptanceEvidence[];
    readonly functionalAcceptancePlan?: FunctionalAcceptancePlan;
}

export type ProductionMissionExecutor = (context: MissionExecutionContext) => Promise<MissionExecutionResult>;

export interface ProductionMissionRequest {
    readonly disposableAttempt?: DisposableProductionAttempt;
    readonly systemId: string;
    readonly actorId: string;
    readonly authorizationArtifactId: string;
    readonly repository: string;
    readonly branch: string;
    readonly commit: string;
    readonly approvedMissionIds?: readonly string[];
    readonly autonomousContinuation?: boolean;
    readonly maximumMissions?: number;
    readonly triggerSource?: ProductionRun["triggerSource"];
    readonly buildChannel: Readonly<{
        channelId: string;
        systemId: string;
        operatingSystemId: string;
        connectorId: string;
        repository: string;
        domainRegistrationIds: readonly string[];
    }>;
}

export interface ProductionMissionSequence {
    readonly runs: readonly ProductionRun[];
    readonly stopReason: "APPROVAL_REQUIRED" | "INDEPENDENT_VERIFICATION_REQUIRED" | "VALIDATION_IN_PROGRESS" | "NO_ELIGIBLE_MISSION" | "NO_EXECUTION_ADAPTER" | "MISSION_LIMIT_REACHED";
    readonly nextMission?: MissionQueueItem;
}

export class ProductionMissionRunner {
    constructor(private readonly state: GenesisStateRepository,
        private readonly runtime = new ProductionRuntimeService(state),
        private readonly report: (stage: string, message: string) => void = () => undefined) {}

    assertHostedDisposableAdmission(request: ProductionMissionRequest, attempt: DisposableProductionAttempt): void {
        this.state.assertDisposableNamespace(attempt.namespace);
        if (this.runtime.activeRun(request.repository) || this.state.executionLeases().some(lease =>
            lease.repository.toLowerCase() === request.repository.toLowerCase() && lease.status === "ACTIVE")) {
            throw new Error("Hosted repository already has an active run or lease.");
        }
        if (this.state.productionRuns().some(run => run.authorizationArtifactId === request.authorizationArtifactId ||
            run.disposableAttempt?.attemptId === attempt.attemptId ||
            (run.repository.toLowerCase() === request.repository.toLowerCase() && run.disposableAttempt?.missionId === attempt.missionId))) {
            throw new Error("Hosted disposable mission or approval was already claimed.");
        }
        if (new GovernedMissionQueue().next(this.state.missionQueue(request.systemId))?.missionId !== attempt.missionId ||
            !this.state.missionQueue(request.systemId).some(mission => mission.missionId === attempt.missionId && mission.approvalRequired)) {
            throw new Error("Hosted mission is not the approval-required queue head.");
        }
    }

    /** Only for the process that already owns a verified, CAS-transferred plan-ready
     * lease. Never reacquire admission or replace the original run/nonce. */
    async continueHostedPlanReady(request: ProductionMissionRequest, original: SignedHostedMissionApproval,
        scope: HostedMissionScope, recovery: PlanReadyRecoveryAuthorization, dependencies: HostedExecutionDependencies,
        fence: HostedExecutionLease, github: Pick<GitHubAppPlaybookPrApi, "assertRecoveryPublicationBase">,
        executor: ProductionMissionExecutor): Promise<ProductionMissionSequence> {
        const { pin, approval } = recovery;
        const expected = { missionId: pin.missionId, repository: request.repository, commit: request.commit,
            operatorId: request.actorId, scope };
        const signed = () => verifyPlanReadyRecoveryApproval(recovery, expected, dependencies.trustedPublicKeyPem);
        // Historical verification is solely to authenticate the consumed envelope recorded
        // at admission. Only the separate recovery signature is checked against current time.
        if (!signed() || !verifyHostedMissionApproval(original, expected, dependencies.trustedPublicKeyPem,
            new Date(original.payload.issuedAt)) || original.payload.nonce !== pin.nonce ||
            request.authorizationArtifactId !== "hosted-approval:" + pin.nonce || scope.branch !== request.branch ||
            request.maximumMissions !== 1 || request.autonomousContinuation !== false ||
            request.approvedMissionIds?.length !== 1 || request.approvedMissionIds[0] !== pin.missionId ||
            request.disposableAttempt || request.triggerSource === "CONTINUATION") throw Error("RECOVERY_AUTHORIZATION");
        if (!await dependencies.hostAttested() || !await dependencies.canonicalStateVerified() ||
            !await dependencies.durableStateVerified?.()) throw Error("RECOVERY_HOST_BINDINGS");
        this.state.assertDisposableNamespace(dependencies.disposableNamespace);
        const inspect = () => {
            const run = this.runtime.run(pin.runId);
            const attempt = run?.disposableAttempt;
            const plan = run?.executionPlan;
            const event = this.state.productionEvents(pin.runId).at(-1);
            const mission = new GovernedMissionQueue().next(this.state.missionQueue(request.systemId));
            const leases = this.state.executionLeases().filter(l => l.repository.toLowerCase() === pin.repository.toLowerCase() && l.status === "ACTIVE");
            const [lease] = leases;
            const prior = lease?.recoveryMetadata;
            if (!run || !attempt || !plan || run.status !== "RUNNING" || run.activeStageId || run.stageIds.length ||
                this.state.productionStages(pin.runId).length || run.autonomousContinuation || run.systemId !== request.systemId ||
                run.actorId !== request.actorId || run.repository !== pin.repository || run.startingCommit !== pin.commit ||
                run.currentCommit !== pin.commit || run.currentBranch !== request.branch || run.startingBranch !== request.branch ||
                run.authorizationArtifactId !== request.authorizationArtifactId || plan.runId !== pin.runId ||
                plan.missionId !== pin.missionId || event?.type !== "EXECUTION_PLAN_READY" || event.payload.planId !== plan.planId ||
                !mission?.approvalRequired || mission.missionId !== pin.missionId || mission.title !== run.selectedMission ||
                attempt.namespace !== dependencies.disposableNamespace || attempt.missionId !== pin.missionId ||
                attempt.attemptId !== pin.nonce || attempt.scopeDigest !== pin.scopeDigest || attempt.workerStartedAt ||
                attempt.workerFinishedAt || attempt.quarantine ||
                attempt.approvalDigest !== createHash("sha256").update(original.signatureBase64).digest("hex")) {
                throw Error("RECOVERY_CHECKPOINT");
            }
            const historical = this.state.executionLeases().find(l => l.leaseId === pin.oldLeaseId);
            if (historical?.runId !== pin.runId || historical.status !== "STALE" || historical.releaseMethod !== "RECOVERED" ||
                historical.actorId !== run.actorId || historical.commit !== pin.commit || historical.repository !== run.repository ||
                historical.branch !== scope.branch || leases.length !== 1 || lease.runId !== pin.runId || lease.actorId !== run.actorId ||
                lease.commit !== pin.commit || lease.branch !== request.branch || lease.host !== hostname() ||
                lease.processId !== process.pid || !(Date.parse(lease.expiresAt) > Date.now()) ||
                !prior || prior.previousLeaseId !== pin.oldLeaseId || prior.previousStateGeneration !== pin.stateGeneration ||
                prior.previousLockGeneration !== pin.lockGeneration || prior.previousStateSha256 !== pin.stateSha256 ||
                fence.resource !== "pbos:mission:" + pin.repository + ":" + pin.missionId || fence.fencingToken < 1n ||
                prior.ownerId !== fence.ownerId || prior.fencingToken !== fence.fencingToken.toString()) throw Error("RECOVERY_FENCE");
            return { run, plan, mission, attempt };
        };
        inspect();
        await github.assertRecoveryPublicationBase(pin.repository, pin.commit, recovery.publicationBase);
        if (!await dependencies.assertFencedLease(fence) || !signed()) throw Error("RECOVERY_FENCE_OR_EXPIRY");
        if (!await dependencies.recordApprovalNonce(approval.payload.nonce, pin.missionId, pin.repository,
            approval.payload.expiresAt)) throw Error("RECOVERY_NONCE_USED");
        if (!await dependencies.assertFencedLease(fence) || !signed()) throw Error("RECOVERY_FENCE_OR_EXPIRY");
        const selected = inspect();
        return this.runSequence({ ...request, disposableAttempt: selected.attempt }, () => executor, {
            ...selected, evidence: { recoveryNonce: approval.payload.nonce, recoveryDigest: approval.payload.scopeDigest,
                originalNonce: pin.nonce, publicationBase: recovery.publicationBase }
        });
    }

    async run(request: ProductionMissionRequest,
        executorFor: (mission: MissionQueueItem) => ProductionMissionExecutor | undefined): Promise<ProductionMissionSequence> {
        return this.runSequence(request, executorFor);
    }

    private async runSequence(request: ProductionMissionRequest,
        executorFor: (mission: MissionQueueItem) => ProductionMissionExecutor | undefined,
        recovered?: { run: ProductionRun; plan: ProductionExecutionPlan; mission: MissionQueueItem;
            evidence: Readonly<Record<string, string>> }): Promise<ProductionMissionSequence> {
        const maximumMissions = request.maximumMissions ?? 10;
        const disposable = request.disposableAttempt;
        if (disposable) {
            this.state.assertDisposableNamespace(disposable.namespace);
            if (maximumMissions !== 1 || request.autonomousContinuation !== false ||
                request.approvedMissionIds?.length !== 1 || request.approvedMissionIds[0] !== disposable.missionId) {
                throw new Error("Disposable admission requires one explicitly authorized mission and no continuation.");
            }
            if (!recovered && this.state.productionRuns().some(run => run.disposableAttempt?.missionId === disposable.missionId &&
                run.repository.toLowerCase() === request.repository.toLowerCase())) {
                throw new Error("Disposable mission or signed attempt has already been claimed.");
            }
        }
        if (!Number.isInteger(maximumMissions) || maximumMissions < 1 || maximumMissions > 10) {
            throw new Error("Autonomous mission limit must be between 1 and 10.");
        }
        if (!/^[a-f0-9]{7,40}$/i.test(request.commit) || !request.repository.includes("/")) {
            throw new Error("Production mission requires exact repository lineage.");
        }
        if (!request.buildChannel.channelId || request.buildChannel.systemId !== request.systemId ||
            request.buildChannel.repository !== request.repository || !request.buildChannel.operatingSystemId ||
            !request.buildChannel.connectorId || request.buildChannel.domainRegistrationIds.length === 0) {
            throw new Error("Production mission requires a matching Genesis to PBOS v1 build channel.");
        }
        const completed: ProductionRun[] = [];
        let parentRunId: string | undefined;
        for (let index = 0; index < maximumMissions; index += 1) {
            const recovering = this.runtime.activeRun(request.repository);
            const mission = recovered?.mission ?? (recovering?.status === "RECOVERING"
                ? this.state.missionQueue(request.systemId).find(item => item.title === recovering.selectedMission)
                : new GovernedMissionQueue().next(this.state.missionQueue(request.systemId)));
            if (!mission || (disposable && mission.missionId !== disposable.missionId)) {
                return { runs: completed, stopReason: "NO_ELIGIBLE_MISSION" };
            }
            if (mission.approvalRequired && !(request.approvedMissionIds ?? []).includes(mission.missionId)) {
                return { runs: completed, stopReason: "APPROVAL_REQUIRED", nextMission: mission };
            }
            const executor = executorFor(mission);
            if (!executor) return { runs: completed, stopReason: "NO_EXECUTION_ADAPTER", nextMission: mission };

            this.report("MISSION_SELECTED", `${mission.title} — ${mission.rationale}`);
            let run: ProductionRun;
            let plan: ProductionExecutionPlan;
            if (recovered) {
                run = recovered.run;
                plan = recovered.plan;
            } else if (recovering?.status === "RECOVERING") {
                if (disposable || recovering.disposableAttempt) {
                    throw new Error("Disposable attempts do not permit automatic worker restart.");
                }
                if (recovering.systemId !== request.systemId || recovering.selectedMission !== mission.title ||
                    recovering.startingCommit !== request.commit || recovering.actorId !== request.actorId ||
                    recovering.resumeCheckpoint !== "EXECUTION") {
                    throw new Error(`Recovering run ${recovering.runId} does not match the selected execution mission lineage.`);
                }
                run = this.runtime.resume(recovering.runId, request.actorId);
                if (run.status !== "RUNNING") {
                    throw new Error(`Recovering execution run ${run.runId} resumed into unexpected status ${run.status}.`);
                }
                plan = run.executionPlan ?? this.plan(run.runId, mission);
                if (!run.executionPlan) this.runtime.recordExecutionPlan(run.runId, plan);
                this.report("RUN_RECOVERING", `Resuming ${mission.title} in existing run ${run.runId}.`);
            } else {
                run = this.runtime.begin({ systemId: request.systemId, actorId: request.actorId,
                    authorizationArtifactId: request.authorizationArtifactId, repository: request.repository,
                    branch: request.branch, commit: request.commit, objective: mission.title, mission: mission.title,
                    rationale: mission.rationale, dependencies: mission.dependencies, parentRunId,
                    triggerSource: parentRunId ? "CONTINUATION" : request.triggerSource ?? "CLI",
                    autonomousContinuation: request.autonomousContinuation ?? true, runType: "READINESS",
                    disposableAttempt: disposable });
                this.runtime.transition(run.runId, "QUEUED", "Eligible mission entered the governed execution queue.", {
                    missionId: mission.missionId, buildChannelId: request.buildChannel.channelId,
                    operatingSystemId: request.buildChannel.operatingSystemId,
                    connectorId: request.buildChannel.connectorId,
                    domainRegistrationIds: request.buildChannel.domainRegistrationIds
                });
                this.runtime.transition(run.runId, "STARTING", "Authorized mission execution is starting.");
                plan = this.plan(run.runId, mission);
                this.runtime.recordExecutionPlan(run.runId, plan);
                this.runtime.transition(run.runId, "RUNNING", "Mission execution started.");
            }
            this.runtime.updateMissionStatus(request.systemId, mission.missionId, "ACTIVE");
            const stage = this.runtime.startStage(run.runId, "EXECUTION", mission.title, { planId: plan.planId, missionId: mission.missionId, ...recovered?.evidence });
            this.report("RUNNING", `${mission.title} is active (run ${run.runId}).`);

            try {
                const result = await executor({ run: this.runtime.run(run.runId)!, mission, report: this.report });
                if (mission.completionPolicy?.kind === "FUNCTIONAL_APPLICATION" && !result.functionalAcceptancePlan) {
                    throw new Error(`Functional mission ${mission.missionId} execution adapter did not produce an executable acceptance plan.`);
                }
                const revision = typeof result.outputs.revision === "string" ? result.outputs.revision : undefined;
                const resultBranch = typeof result.outputs.branch === "string" ? result.outputs.branch : request.branch;
                if (revision && /^[a-f0-9]{7,40}$/i.test(revision)) this.runtime.updateRepositoryPosition(run.runId, resultBranch, revision);
                const verifier = new FunctionalAcceptanceVerifier();
                verifier.assertImplementationEvidence(mission, result.acceptanceEvidence ?? [], request.repository, revision ?? request.commit);
                if (result.acceptanceEvidence?.length) this.runtime.recordAcceptanceEvidence(run.runId, result.acceptanceEvidence);
                if (result.functionalAcceptancePlan) this.runtime.recordFunctionalAcceptancePlan(run.runId, result.functionalAcceptancePlan);
                result.commands?.forEach(item => this.runtime.recordCommand(run.runId, item.command, item.exitCode, item.durationMs, item.output));
                if (result.files) this.runtime.recordFiles(run.runId, result.files);
                this.runtime.completeStage(stage.stageId, result.outputs, result.evidenceIds);
                this.runtime.transition(run.runId, "VALIDATING", "Mission result validation started.");
                const validationStage = this.runtime.startStage(run.runId, "VALIDATION", `Validate ${mission.title}`);
                result.validations.forEach(item => this.runtime.recordValidation(run.runId, item.name, item.passed, item.durationMs, item.evidenceId));
                const failed = result.validations.filter(item => !item.passed);
                if (result.deferredValidation && failed.length === 0) {
                    this.runtime.recordValidation(run.runId, "GitHub Actions validation monitor started", true, 0,
                        `remediation-run:${result.deferredValidation.remediationRunId}`);
                    run = this.runtime.run(run.runId)!;
                    completed.push(run);
                    this.report("VALIDATING", `External validation is active for ${result.deferredValidation.pullRequestUrl}.`);
                    return { runs: completed, stopReason: "VALIDATION_IN_PROGRESS" };
                }
                this.runtime.completeStage(validationStage.stageId, { passed: failed.length === 0, validations: result.validations.length },
                    result.validations.map(item => item.evidenceId));
                if (failed.length) {
                    this.runtime.blockMissionForRun(run.runId,
                        `Mission validation failed: ${failed.map(item => item.name).join(", ")}.`, result.evidenceIds);
                    this.runtime.transition(run.runId, "BLOCKED", "Mission validation failed and requires governed remediation.", {
                        failures: failed.map(item => item.name)
                    });
                    throw new Error(`Mission validation failed: ${failed.map(item => item.name).join(", ")}`);
                }
                if (disposable && result.evidenceNeedsIndependentReview) {
                    run = this.runtime.transition(run.runId, "PAUSED", "Disposable proposal is pending independent verification.");
                    completed.push(run);
                    return { runs: completed, stopReason: "INDEPENDENT_VERIFICATION_REQUIRED" };
                }
                if (mission.approvalRequired) {
                    run = this.runtime.transition(run.runId, "AWAITING_APPROVAL", "Mission validation passed; human certification is required.");
                    completed.push(run);
                    return { runs: completed, stopReason: "APPROVAL_REQUIRED", nextMission: mission };
                }
                this.runtime.updateMissionStatus(request.systemId, mission.missionId, "COMPLETE", result.evidenceIds);
                run = this.runtime.transition(run.runId, "COMPLETED", "Automated mission completed with durable validation evidence.", {
                    missionId: mission.missionId, evidenceIds: result.evidenceIds
                });
                completed.push(run); parentRunId = run.runId;
                this.report("MISSION_COMPLETED", `${mission.title} completed in ${run.durationMs ?? 0}ms.`);
                if (!(request.autonomousContinuation ?? true)) {
                    return { runs: completed, stopReason: "MISSION_LIMIT_REACHED",
                        nextMission: new GovernedMissionQueue().next(this.state.missionQueue(request.systemId)) };
                }
            } catch (error) {
                const current = this.runtime.run(run.runId);
                if (current && !["BLOCKED", "FAILED", "CANCELLED"].includes(current.status)) {
                    if (current.activeStageId) this.runtime.failStage(current.activeStageId, error instanceof Error ? error.message : String(error));
                    this.runtime.blockMissionForRun(run.runId, error instanceof Error ? error.message : String(error));
                    this.runtime.transition(run.runId, "FAILED", "Mission execution failed.", {
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
                throw error;
            }
        }
        return { runs: completed, stopReason: "MISSION_LIMIT_REACHED",
            nextMission: new GovernedMissionQueue().next(this.state.missionQueue(request.systemId)) };
    }

    certify(runId: string, approvalId: string): ProductionRun {
        const run = this.runtime.run(runId);
        if (!run || run.status !== "AWAITING_APPROVAL") throw new Error(`Run ${runId} is not awaiting approval.`);
        const mission = this.state.missionQueue(run.systemId).find(item => item.title === run.selectedMission && item.status === "ACTIVE");
        if (!mission) throw new Error(`Active mission for run ${runId} was not found.`);
        new FunctionalAcceptanceVerifier().assertCertificationEvidence(mission, run);
        const certified = mission.completionPolicy?.kind === "FUNCTIONAL_APPLICATION"
            ? this.runtime.certifyFunctionalApplication(runId, approvalId)
            : this.runtime.transition(runId, "CERTIFIED", "Human mission certification granted.", {
                approvalId, missionId: mission.missionId
            });
        this.runtime.updateMissionStatus(run.systemId, mission.missionId, "COMPLETE", [`approval:${approvalId}`]);
        return certified;
    }

    assertCertifiable(runId: string): void {
        const run = this.runtime.run(runId);
        if (!run || run.status !== "AWAITING_APPROVAL") throw new Error(`Run ${runId} is not awaiting approval.`);
        const mission = this.state.missionQueue(run.systemId)
            .find(item => item.title === run.selectedMission && item.status === "ACTIVE");
        if (!mission) throw new Error(`Active mission for run ${runId} was not found.`);
        new FunctionalAcceptanceVerifier().assertCertificationEvidence(mission, run);
    }

    private plan(runId: string, mission: MissionQueueItem): ProductionExecutionPlan {
        return { planId: randomUUID(), runId, missionId: mission.missionId, objective: mission.title,
            governingSpecifications: [mission.missionId.split("-").slice(0, 2).join("-").toUpperCase(), "PBOS-AUTONOMOUS-PRODUCTION-AND-MISSION-CONTROL-001"],
            inScope: [mission.title], outOfScope: ["Production deployment", "Secrets", "Destructive migration", "Cross-repository mutation"],
            dependencies: mission.dependencies, expectedFiles: [], databaseChanges: [], apiChanges: [], uiChanges: [],
            securityImplications: ["Preserve repository authority and application data boundaries"],
            dataImplications: ["Use repository metadata and nonproduction evidence only"],
            accessibilityImplications: ["Include accessibility acceptance criteria for experience-changing work"],
            testPlan: ["Validate repository lineage", "Validate mission-specific acceptance evidence"],
            previewPlan: ["Generate commit-bound desktop and mobile evidence when experience-changing"],
            recoveryPlan: ["Resume from the last durable stage checkpoint after stale lease classification"],
            certificationCriteria: ["All mission validations pass", ...(mission.approvalRequired ? ["Human approval is recorded"] : [])],
            expectedArtifacts: [`mission-result:${mission.missionId}`],
            approvalRequirements: mission.approvalRequired ? ["HUMAN_APPROVAL"] : [], createdAt: new Date().toISOString() };
    }
}
