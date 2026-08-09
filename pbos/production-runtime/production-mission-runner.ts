import { randomUUID } from "crypto";
import { GenesisStateRepository } from "../genesis-state";
import { GovernedMissionQueue } from "./mission-queue";
import { ApplicationAcceptanceEvidence, FunctionalAcceptancePlan, MissionQueueItem, ProductionExecutionPlan, ProductionRun } from "./contracts";
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
    readonly acceptanceEvidence?: readonly ApplicationAcceptanceEvidence[];
    readonly functionalAcceptancePlan?: FunctionalAcceptancePlan;
}

export type ProductionMissionExecutor = (context: MissionExecutionContext) => Promise<MissionExecutionResult>;

export interface ProductionMissionRequest {
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
    readonly stopReason: "APPROVAL_REQUIRED" | "VALIDATION_IN_PROGRESS" | "NO_ELIGIBLE_MISSION" | "NO_EXECUTION_ADAPTER" | "MISSION_LIMIT_REACHED";
    readonly nextMission?: MissionQueueItem;
}

export class ProductionMissionRunner {
    constructor(private readonly state: GenesisStateRepository,
        private readonly runtime = new ProductionRuntimeService(state),
        private readonly report: (stage: string, message: string) => void = () => undefined) {}

    async run(request: ProductionMissionRequest,
        executorFor: (mission: MissionQueueItem) => ProductionMissionExecutor | undefined): Promise<ProductionMissionSequence> {
        const maximumMissions = request.maximumMissions ?? 10;
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
            const mission = recovering?.status === "RECOVERING"
                ? this.state.missionQueue(request.systemId).find(item => item.title === recovering.selectedMission)
                : new GovernedMissionQueue().next(this.state.missionQueue(request.systemId));
            if (!mission) return { runs: completed, stopReason: "NO_ELIGIBLE_MISSION" };
            if (mission.approvalRequired && !(request.approvedMissionIds ?? []).includes(mission.missionId)) {
                return { runs: completed, stopReason: "APPROVAL_REQUIRED", nextMission: mission };
            }
            const executor = executorFor(mission);
            if (!executor) return { runs: completed, stopReason: "NO_EXECUTION_ADAPTER", nextMission: mission };

            this.report("MISSION_SELECTED", `${mission.title} — ${mission.rationale}`);
            let run: ProductionRun;
            let plan: ProductionExecutionPlan;
            if (recovering?.status === "RECOVERING") {
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
                    autonomousContinuation: request.autonomousContinuation ?? true, runType: "READINESS" });
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
            const stage = this.runtime.startStage(run.runId, "EXECUTION", mission.title, { planId: plan.planId, missionId: mission.missionId });
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
