import { hostname } from "os";
import { randomUUID } from "crypto";
import { GenesisStateRepository } from "../genesis-state";
import { ApplicationAcceptanceEvidence, ApplicationDeliveryProof, ExecutionLease, FunctionalAcceptancePlan, MissionControlApplicationPreview, MissionControlSnapshot, MissionQueueItem,
    PreviewManifest, ProductionEvent, ProductionExecutionPlan, ProductionRun, ProductionStage, ProductionStatus,
    RuntimeHealthReport, RuntimeMetrics, StageType } from "./contracts";
import { assertProductionTransition, isTerminalProductionStatus } from "./status-machine";
import { GovernedMissionQueue } from "./mission-queue";
import { FunctionalAcceptanceVerifier } from "./functional-acceptance-verifier";

export interface BeginProductionRun {
    readonly runId?: string;
    readonly systemId: string;
    readonly actorId: string;
    readonly authorizationArtifactId: string;
    readonly repository: string;
    readonly branch: string;
    readonly commit: string;
    readonly objective: string;
    readonly mission: string;
    readonly rationale: string;
    readonly dependencies?: readonly string[];
    readonly parentRunId?: string;
    readonly triggerSource?: ProductionRun["triggerSource"];
    readonly autonomousContinuation?: boolean;
    readonly runType?: ProductionRun["runType"];
}

const ACTIVE: readonly ProductionStatus[] = ["PLANNING", "AUTHORIZED", "QUEUED", "STARTING", "RUNNING", "VALIDATING", "REPAIRING", "GENERATING_PREVIEW", "AWAITING_APPROVAL", "PAUSED", "RECOVERING"];
const LEASE_REQUIRED: readonly ProductionStatus[] = ["AUTHORIZED", "QUEUED", "STARTING", "RUNNING", "VALIDATING", "REPAIRING", "GENERATING_PREVIEW", "RECOVERING"];
export const DEFAULT_PRODUCTION_REPAIR_LIMIT = 5;

export class ProductionRuntimeService {
    constructor(private readonly state: GenesisStateRepository, private readonly leaseTtlMs = 30_000,
        private readonly now: () => Date = () => new Date()) {}

    begin(input: BeginProductionRun): ProductionRun {
        if (!input.authorizationArtifactId.trim()) throw new Error("Production execution requires a verifiable authorization artifact.");
        const active = this.activeRun(input.repository);
        if (active) throw new Error(`Production execution already owned by run ${active.runId}.`);
        const timestamp = this.now().toISOString();
        const runId = input.runId ?? randomUUID();
        const run: ProductionRun = {
            runId, runType: input.runType ?? "AUTONOMOUS_BUILD", triggerSource: input.triggerSource ?? "CLI", actorId: input.actorId,
            authorizationArtifactId: input.authorizationArtifactId, parentRunId: input.parentRunId,
            repositoryContextId: `repository:${input.repository}:${input.commit}`,
            runtimeContextId: `runtime:${runId}`, systemId: input.systemId, repository: input.repository,
            startingBranch: input.branch, startingCommit: input.commit, currentBranch: input.branch, currentCommit: input.commit,
            requestedObjective: input.objective, selectedMission: input.mission, selectionRationale: input.rationale,
            dependencySnapshot: input.dependencies ?? [], status: "AUTHORIZED", startedAt: timestamp, lastHeartbeatAt: timestamp,
            stageIds: [], retryCount: 0, repairAttempts: 0, repairAttemptLimit: DEFAULT_PRODUCTION_REPAIR_LIMIT,
            repairExtensionApprovalIds: [], recoveryEpochIds: [], filesAdded: [], filesModified: [], filesDeleted: [],
            commandsExecuted: [], testsExecuted: [], validationResults: [], previewArtifactIds: [], evidenceIds: [],
            acceptanceEvidence: [], blockers: [],
            autonomousContinuation: input.autonomousContinuation ?? true
        };
        this.state.saveProductionRun(run);
        this.event(run, "RUN_REQUESTED", "Production run requested and authorized.", { objective: input.objective });
        this.acquireLease(run);
        return run;
    }

    transition(runId: string, status: ProductionStatus, summary: string, payload: Readonly<Record<string, unknown>> = {}): ProductionRun {
        const current = this.requireRun(runId);
        const mission = this.state.missionQueue(current.systemId).find(item => item.title === current.selectedMission);
        if (["AWAITING_APPROVAL", "CERTIFIED"].includes(status) && mission?.completionPolicy?.kind === "FUNCTIONAL_APPLICATION") {
            throw new Error(`Functional mission ${mission.missionId} may advance only through PBOS Kernel functional authority.`);
        }
        return this.commitTransition(current, status, summary, payload);
    }

    acceptFunctionalApplication(runId: string, summary: string,
        payload: Readonly<Record<string, unknown>> = {}): ProductionRun {
        const current = this.requireRun(runId);
        const mission = this.state.missionQueue(current.systemId).find(item => item.title === current.selectedMission);
        if (mission?.completionPolicy?.kind !== "FUNCTIONAL_APPLICATION") {
            throw new Error(`Run ${runId} is not governed by a functional application completion policy.`);
        }
        new FunctionalAcceptanceVerifier().assertCertificationEvidence(mission, current);
        const completedTypes = new Set(this.state.productionStages(runId)
            .filter(stage => stage.status === "COMPLETED").map(stage => stage.type));
        const requiredStages: StageType[] = ["PREREQUISITE", "APPLICATION_LAUNCH", "RUNTIME_VERIFICATION", "BROWSER_JOURNEY", "ACCEPTANCE"];
        if (current.functionalAcceptancePlan?.nativeJourneys?.length) requiredStages.push("NATIVE_JOURNEY");
        if (mission.completionPolicy.requiredDimensions.includes("PREVIEW")) requiredStages.push("PREVIEW");
        const missing = requiredStages.filter(type => !completedTypes.has(type));
        if (missing.length) throw new Error(`Functional mission ${mission.missionId} is missing kernel stages: ${missing.join(", ")}.`);
        return this.commitTransition(current, "AWAITING_APPROVAL", summary, payload);
    }

    certifyFunctionalApplication(runId: string, approvalId: string): ProductionRun {
        const current = this.requireRun(runId);
        if (current.status !== "AWAITING_APPROVAL" || !approvalId.trim()) {
            throw new Error(`Functional run ${runId} requires a verifiable human certification approval.`);
        }
        const mission = this.state.missionQueue(current.systemId).find(item => item.title === current.selectedMission);
        if (mission?.completionPolicy?.kind !== "FUNCTIONAL_APPLICATION") {
            throw new Error(`Run ${runId} is not governed by a functional application completion policy.`);
        }
        new FunctionalAcceptanceVerifier().assertCertificationEvidence(mission, current);
        return this.commitTransition(current, "CERTIFIED", "Human functional certification granted.", {
            approvalId, missionId: mission.missionId
        });
    }

    private commitTransition(current: ProductionRun, status: ProductionStatus, summary: string,
        payload: Readonly<Record<string, unknown>>): ProductionRun {
        assertProductionTransition(current.status, status);
        if (["AWAITING_APPROVAL", "COMPLETED", "CERTIFIED"].includes(status)) {
            const mission = this.state.missionQueue(current.systemId).find(item => item.title === current.selectedMission);
            if (mission) new FunctionalAcceptanceVerifier().assertCertificationEvidence(mission, current);
        }
        const timestamp = this.now().toISOString();
        const terminal = isTerminalProductionStatus(status);
        const updated: ProductionRun = { ...current, status, lastHeartbeatAt: timestamp,
            completedAt: terminal ? timestamp : undefined,
            durationMs: terminal ? Math.max(0, this.now().getTime() - Date.parse(current.startedAt)) : undefined,
            terminalSummary: terminal ? summary : undefined };
        this.state.saveProductionRun(updated);
        this.event(updated, `RUN_${status}`, summary, payload, status === "FAILED" ? "ERROR" : status === "BLOCKED" ? "WARN" : "INFO");
        if (terminal) this.releaseLease(current.runId, status === "CANCELLED" ? "CANCELLED" : "COMPLETED");
        else if (status === "PAUSED" || status === "AWAITING_APPROVAL") this.releaseLease(current.runId, status);
        return updated;
    }

    heartbeat(runId: string): ProductionRun {
        const run = this.requireRun(runId); const timestamp = this.now().toISOString();
        const updated = { ...run, lastHeartbeatAt: timestamp };
        this.state.saveProductionRun(updated);
        const lease = this.activeLease(runId);
        if (lease) this.state.saveExecutionLease({ ...lease, lastRenewedAt: timestamp,
            expiresAt: new Date(this.now().getTime() + this.leaseTtlMs).toISOString() });
        return updated;
    }

    startStage(runId: string, type: StageType, title: string, inputs: Readonly<Record<string, unknown>> = {}, command?: string): ProductionStage {
        const run = this.heartbeat(runId); const timestamp = this.now().toISOString();
        if (run.activeStageId) {
            const active = this.state.productionStages(runId).find(stage => stage.stageId === run.activeStageId);
            if (active && !active.completedAt) {
                throw new Error(`Production run ${runId} already has active stage ${active.stageId} (${active.type}).`);
            }
        }
        const stage: ProductionStage = { stageId: randomUUID(), runId, type, title, status: "RUNNING", startedAt: timestamp,
            lastHeartbeatAt: timestamp, attempt: 1, inputs, outputs: {}, command: command ? this.redact(command) : undefined,
            logs: [], evidenceIds: [] };
        this.state.saveProductionStage(stage);
        this.state.saveProductionRun({ ...run, activeStageId: stage.stageId, stageIds: [...run.stageIds, stage.stageId] });
        this.event(run, "STAGE_STARTED", `${title} started.`, { stageId: stage.stageId, type }, "INFO", stage.stageId);
        return stage;
    }

    completeStage(stageId: string, outputs: Readonly<Record<string, unknown>> = {}, evidenceIds: readonly string[] = []): ProductionStage {
        const stage = this.state.productionStages().find(item => item.stageId === stageId);
        if (!stage) throw new Error(`Production stage not found: ${stageId}`);
        const timestamp = this.now().toISOString();
        const updated: ProductionStage = { ...stage, status: "COMPLETED", completedAt: timestamp,
            lastHeartbeatAt: timestamp, durationMs: Math.max(0, this.now().getTime() - Date.parse(stage.startedAt)), outputs, evidenceIds };
        this.state.saveProductionStage(updated);
        const run = this.requireRun(stage.runId);
        this.state.saveProductionRun({ ...run, activeStageId: undefined, lastHeartbeatAt: timestamp,
            evidenceIds: [...new Set([...run.evidenceIds, ...evidenceIds])] });
        this.event(run, "STAGE_COMPLETED", `${stage.title} completed.`, { stageId, durationMs: updated.durationMs }, "INFO", stageId);
        return updated;
    }

    completeActiveStage(runId: string, outputs: Readonly<Record<string, unknown>> = {}, evidenceIds: readonly string[] = []): ProductionStage | undefined {
        const run = this.requireRun(runId);
        return run.activeStageId ? this.completeStage(run.activeStageId, outputs, evidenceIds) : undefined;
    }

    failStage(stageId: string, error: string): ProductionStage {
        const stage = this.state.productionStages().find(item => item.stageId === stageId);
        if (!stage) throw new Error(`Production stage not found: ${stageId}`);
        const timestamp = this.now().toISOString();
        const updated: ProductionStage = { ...stage, status: "FAILED", completedAt: timestamp, lastHeartbeatAt: timestamp,
            durationMs: Math.max(0, this.now().getTime() - Date.parse(stage.startedAt)), error: this.redact(error) };
        this.state.saveProductionStage(updated);
        const run = this.requireRun(stage.runId);
        if (run.activeStageId === stageId) this.state.saveProductionRun({ ...run, activeStageId: undefined, lastHeartbeatAt: timestamp });
        this.event(run, "STAGE_FAILED", `${stage.title} failed.`, { stageId, error: updated.error }, "ERROR", stageId);
        return updated;
    }

    recordPreview(manifest: PreviewManifest): void {
        if (manifest.runId !== this.requireRun(manifest.runId).runId) throw new Error("Preview lineage is invalid.");
        this.state.savePreviewManifest(manifest);
        const run = this.requireRun(manifest.runId);
        this.state.saveProductionRun({ ...run, previewArtifactIds: [...new Set([...run.previewArtifactIds, manifest.previewId])] });
        this.event(run, manifest.status === "READY" ? "PREVIEW_READY" : "PREVIEW_RECORDED", `Preview ${manifest.status.toLowerCase()}.`, { previewId: manifest.previewId });
    }

    recordCommand(runId: string, command: string, exitCode: number, durationMs: number, output = ""): ProductionRun {
        if (!Number.isInteger(exitCode) || !Number.isFinite(durationMs) || durationMs < 0) throw new Error("Command evidence is invalid.");
        const run = this.heartbeat(runId); const safeCommand = this.redact(command); const safeOutput = this.redact(output).slice(-20_000);
        const updated = { ...run, commandsExecuted: [...run.commandsExecuted, safeCommand] };
        this.state.saveProductionRun(updated);
        this.event(updated, "COMMAND_COMPLETED", `${safeCommand} exited ${exitCode}.`, { command: safeCommand, exitCode, durationMs, output: safeOutput }, exitCode === 0 ? "INFO" : "ERROR");
        return updated;
    }

    recordFiles(runId: string, changes: Readonly<{ added?: readonly string[]; modified?: readonly string[]; deleted?: readonly string[] }>): ProductionRun {
        const run = this.heartbeat(runId);
        const updated = { ...run, filesAdded: [...new Set([...run.filesAdded, ...(changes.added ?? [])])],
            filesModified: [...new Set([...run.filesModified, ...(changes.modified ?? [])])],
            filesDeleted: [...new Set([...run.filesDeleted, ...(changes.deleted ?? [])])] };
        this.state.saveProductionRun(updated);
        this.event(updated, "FILES_CHANGED", "Repository change inventory recorded.", { added: changes.added ?? [], modified: changes.modified ?? [], deleted: changes.deleted ?? [] });
        return updated;
    }

    updateRepositoryPosition(runId: string, branch: string, commit: string): ProductionRun {
        if (!branch.trim() || !/^[a-f0-9]{7,40}$/i.test(commit)) throw new Error("Repository position requires an exact branch and commit.");
        const run = this.heartbeat(runId); const updated = { ...run, currentBranch: branch, currentCommit: commit };
        this.state.saveProductionRun(updated);
        this.event(updated, "REPOSITORY_POSITION_UPDATED", "Production run advanced to a governed repository revision.", { branch, commit });
        return updated;
    }

    rebindRepositoryAfterRemediation(runId: string, remediationRunId: string, branch: string, commit: string): ProductionRun {
        if (!branch.trim() || !/^[a-f0-9]{7,40}$/i.test(commit)) {
            throw new Error("Remediation lineage requires an exact branch and commit.");
        }
        const run = this.heartbeat(runId);
        if (!run.evidenceIds.includes(`remediation-run:${remediationRunId}`)) {
            throw new Error("Remediation lineage is not linked to the production run.");
        }
        if (!run.functionalAcceptancePlan) {
            throw new Error("Functional remediation requires an executable acceptance plan.");
        }
        const browserJourneys = run.functionalAcceptancePlan.browserJourneys.map(journey => ({ ...journey,
            command: { ...journey.command,
                publicEnvironment: journey.command.publicEnvironment?.PBOS_ACCEPTANCE_COMMIT === undefined
                    ? journey.command.publicEnvironment
                    : { ...journey.command.publicEnvironment, PBOS_ACCEPTANCE_COMMIT: commit } } }));
        const nativeJourneys = run.functionalAcceptancePlan.nativeJourneys?.map(journey => ({ ...journey,
            command: { ...journey.command,
                publicEnvironment: journey.command.publicEnvironment?.PBOS_ACCEPTANCE_COMMIT === undefined
                    ? journey.command.publicEnvironment
                    : { ...journey.command.publicEnvironment, PBOS_ACCEPTANCE_COMMIT: commit } } }));
        const previewDeployment = run.functionalAcceptancePlan.previewDeployment
            ? { ...run.functionalAcceptancePlan.previewDeployment, branch, commit } : undefined;
        const plan: FunctionalAcceptancePlan = { ...run.functionalAcceptancePlan, branch, commit, browserJourneys, nativeJourneys,
            previewDeployment, durablePreview: undefined,
            planId: `${run.functionalAcceptancePlan.planId.split(":remediation:")[0]}:remediation:${commit}` };
        const updated: ProductionRun = { ...run, currentBranch: branch, currentCommit: commit,
            repositoryContextId: `repository:${run.repository}:${commit}`, functionalAcceptancePlan: plan,
            acceptanceEvidence: [], previewArtifactIds: [], lastHeartbeatAt: this.now().toISOString() };
        this.state.saveProductionRun(updated);
        this.event(updated, "REMEDIATION_LINEAGE_REBOUND",
            "Production and functional acceptance lineage advanced to the remediated revision.", {
                remediationRunId, branch, commit, planId: plan.planId
            });
        return updated;
    }

    /**
     * Attaches a deterministic repository repair while the original bounded
     * repair budget still has capacity. The existing mission, pull request,
     * and evidence lineage remain authoritative.
     */
    registerBoundedRemediation(runId: string, remediationRunId: string, branch: string, commit: string,
        classification: string): ProductionRun {
        const run = this.requireRun(runId);
        const remediation = this.state.remediationRun(remediationRunId);
        const budget = this.repairBudget(runId);
        if (run.status !== "BLOCKED" || budget.remaining < 1 || run.activeRecoveryEpochId ||
            !remediation || remediation.systemId !== run.systemId ||
            remediation.pullRequest.repository !== run.repository || remediation.pullRequest.branch !== branch ||
            branch !== run.currentBranch || run.evidenceIds.includes(`remediation-run:${remediationRunId}`) ||
            !/^[a-f0-9]{7,40}$/i.test(commit) || commit === run.currentCommit || !classification.trim()) {
            throw new Error("Bounded remediation does not match the blocked production lineage.");
        }
        const linked: ProductionRun = { ...run,
            evidenceIds: [...new Set([...run.evidenceIds, `remediation-run:${remediationRunId}`])],
            lastHeartbeatAt: this.now().toISOString() };
        this.state.saveProductionRun(linked);
        this.event(linked, "BOUNDED_REMEDIATION_REGISTERED",
            "A deterministic repository repair was attached to the existing production mission and pull request.", {
                remediationRunId, branch, commit, classification,
                repairAttempts: budget.attempts, repairAttemptLimit: budget.limit
            });
        return this.rebindRepositoryAfterRemediation(runId, remediationRunId, branch, commit);
    }

    /**
     * Attaches a newly prepared repository repair to an authorized recovery epoch.
     * The existing production run and mission remain authoritative; only their
     * repository position and functional plan advance to the governed repair.
     */
    registerRecoveryRemediation(runId: string, remediationRunId: string, branch: string, commit: string,
        classification: string): ProductionRun {
        const run = this.requireRun(runId);
        const remediation = this.state.remediationRun(remediationRunId);
        const epoch = run.activeRecoveryEpochId
            ? this.state.productionRecoveryEpoch(run.activeRecoveryEpochId) : undefined;
        const budget = this.repairBudget(runId);
        if (run.status !== "BLOCKED" || !epoch || epoch.status !== "ACTIVE" || epoch.runId !== runId ||
            budget.remaining < 1 || !remediation || remediation.systemId !== run.systemId ||
            remediation.pullRequest.repository !== run.repository || remediation.pullRequest.branch !== branch ||
            run.evidenceIds.includes(`remediation-run:${remediationRunId}`) ||
            !/^[a-f0-9]{7,40}$/i.test(commit) || !classification.trim()) {
            throw new Error("Recovery remediation does not match an active authorized production epoch.");
        }
        const linked: ProductionRun = { ...run,
            evidenceIds: [...new Set([...run.evidenceIds, `remediation-run:${remediationRunId}`])],
            lastHeartbeatAt: this.now().toISOString() };
        this.state.saveProductionRun(linked);
        this.event(linked, "RECOVERY_REMEDIATION_REGISTERED",
            "A governed repository repair was attached to the existing production mission.", {
                recoveryEpochId: epoch.recoveryEpochId, remediationRunId, branch, commit, classification
            });
        return this.rebindRepositoryAfterRemediation(runId, remediationRunId, branch, commit);
    }

    /**
     * Repairs nested acceptance lineage in durable plans written by older PBOS
     * revisions. This does not authorize a new revision: it may only make the
     * plan agree with the already-governed current repository position.
     */
    normalizeFunctionalAcceptanceLineage(runId: string): ProductionRun {
        const run = this.requireRun(runId);
        const current = run.functionalAcceptancePlan;
        if (!current) return run;
        const browserJourneys = current.browserJourneys.map(journey => ({ ...journey,
            command: { ...journey.command,
                publicEnvironment: journey.command.publicEnvironment?.PBOS_ACCEPTANCE_COMMIT === undefined
                    ? journey.command.publicEnvironment
                    : { ...journey.command.publicEnvironment, PBOS_ACCEPTANCE_COMMIT: run.currentCommit } } }));
        const nativeJourneys = current.nativeJourneys?.map(journey => ({ ...journey,
            command: { ...journey.command,
                publicEnvironment: journey.command.publicEnvironment?.PBOS_ACCEPTANCE_COMMIT === undefined
                    ? journey.command.publicEnvironment
                    : { ...journey.command.publicEnvironment, PBOS_ACCEPTANCE_COMMIT: run.currentCommit } } }));
        const changed = current.branch !== run.currentBranch || current.commit !== run.currentCommit ||
            browserJourneys.some((journey, index) =>
                journey.command.publicEnvironment?.PBOS_ACCEPTANCE_COMMIT !==
                current.browserJourneys[index].command.publicEnvironment?.PBOS_ACCEPTANCE_COMMIT) ||
            (nativeJourneys ?? []).some((journey, index) =>
                journey.command.publicEnvironment?.PBOS_ACCEPTANCE_COMMIT !==
                current.nativeJourneys?.[index].command.publicEnvironment?.PBOS_ACCEPTANCE_COMMIT);
        if (!changed) return run;
        const previewDeployment = current.previewDeployment
            ? { ...current.previewDeployment, branch: run.currentBranch, commit: run.currentCommit } : undefined;
        const plan: FunctionalAcceptancePlan = { ...current, branch: run.currentBranch, commit: run.currentCommit,
            previewDeployment, durablePreview: current.commit === run.currentCommit ? current.durablePreview : undefined,
            browserJourneys, nativeJourneys, planId: `${current.planId.split(":lineage:")[0]}:lineage:${run.currentCommit}` };
        const updated: ProductionRun = { ...run, functionalAcceptancePlan: plan,
            acceptanceEvidence: current.commit === run.currentCommit ? run.acceptanceEvidence : [],
            previewArtifactIds: current.commit === run.currentCommit ? run.previewArtifactIds : [],
            lastHeartbeatAt: this.now().toISOString() };
        this.state.saveProductionRun(updated);
        this.event(updated, "FUNCTIONAL_ACCEPTANCE_LINEAGE_NORMALIZED",
            "Durable functional acceptance lineage synchronized to the governed repository revision.", {
                branch: run.currentBranch, commit: run.currentCommit, planId: plan.planId
            });
        return updated;
    }

    recordValidation(runId: string, name: string, passed: boolean, durationMs: number, evidenceId: string): ProductionRun {
        if (!name.trim() || !evidenceId.trim() || durationMs < 0) throw new Error("Validation evidence is incomplete.");
        const run = this.heartbeat(runId);
        const result = `${name}:${passed ? "PASSED" : "FAILED"}:${durationMs}ms:${evidenceId}`;
        const updated = { ...run, validationResults: [...run.validationResults, result],
            testsExecuted: /test/i.test(name) ? [...run.testsExecuted, name] : run.testsExecuted,
            evidenceIds: [...new Set([...run.evidenceIds, evidenceId])] };
        this.state.saveProductionRun(updated);
        this.event(updated, passed ? "VALIDATION_PASSED" : "VALIDATION_FAILED", `${name} ${passed ? "passed" : "failed"}.`, { name, durationMs, evidenceId }, passed ? "INFO" : "ERROR");
        return updated;
    }

    recordAcceptanceEvidence(runId: string, evidence: readonly ApplicationAcceptanceEvidence[]): ProductionRun {
        if (!evidence.length) return this.requireRun(runId);
        const run = this.heartbeat(runId);
        const byId = new Map((run.acceptanceEvidence ?? []).map(item => [item.evidenceId, item]));
        for (const item of evidence) byId.set(item.evidenceId, item);
        const updated: ProductionRun = { ...run, acceptanceEvidence: [...byId.values()] };
        this.state.saveProductionRun(updated);
        this.event(updated, "ACCEPTANCE_EVIDENCE_RECORDED", "Functional application acceptance evidence recorded.", {
            evidenceIds: evidence.map(item => item.evidenceId), dimensions: [...new Set(evidence.map(item => item.dimension))]
        });
        return updated;
    }

    repairBudget(runId: string): Readonly<{ attempts: number; limit: number; remaining: number }> {
        const run = this.requireRun(runId);
        const limit = run.repairAttemptLimit ?? DEFAULT_PRODUCTION_REPAIR_LIMIT;
        return { attempts: run.repairAttempts, limit, remaining: Math.max(0, limit - run.repairAttempts) };
    }

    registerRecoveryEpoch(runId: string, recoveryEpochId: string): ProductionRun {
        const run = this.requireRun(runId);
        const epoch = this.state.productionRecoveryEpoch(recoveryEpochId);
        if (!epoch || epoch.runId !== runId || epoch.status !== "AWAITING_AUTHORIZATION") {
            throw new Error("Recovery epoch registration does not match the blocked production run.");
        }
        const updated: ProductionRun = { ...run,
            recoveryEpochIds: [...new Set([...(run.recoveryEpochIds ?? []), recoveryEpochId])],
            evidenceIds: [...new Set([...run.evidenceIds, `recovery-epoch:${recoveryEpochId}`])],
            lastHeartbeatAt: this.now().toISOString() };
        this.state.saveProductionRun(updated);
        this.event(updated, "RECOVERY_AUTHORITY_REQUESTED",
            `Recovery epoch ${epoch.epochNumber} requires explicit operator authorization.`, {
                recoveryEpochId, epochNumber: epoch.epochNumber, repairAttempts: epoch.runtimeState.repairAttempts,
                repairAttemptLimit: epoch.runtimeState.repairAttemptLimit, remainingDefects: epoch.remainingDefects
            });
        return updated;
    }

    activateRecoveryEpoch(runId: string, recoveryEpochId: string, approvalId: string, actorId: string,
        additionalAttempts = 1): ProductionRun {
        const run = this.requireActor(runId, actorId);
        const epoch = this.state.productionRecoveryEpoch(recoveryEpochId);
        const budget = this.repairBudget(runId);
        if (!epoch || epoch.runId !== runId || epoch.status !== "AUTHORIZED" ||
            epoch.authorizationApprovalId !== approvalId || run.status !== "BLOCKED" || budget.remaining > 0) {
            throw new Error(`Run ${runId} is not eligible for an authorized recovery epoch.`);
        }
        if (!approvalId.trim() || additionalAttempts !== 1) {
            throw new Error("A constitutional recovery epoch authorizes exactly one additional bounded repair attempt.");
        }
        const approvals = [...new Set([...(run.repairExtensionApprovalIds ?? []), approvalId])];
        if (approvals.length === (run.repairExtensionApprovalIds ?? []).length) {
            throw new Error(`Repair-budget approval ${approvalId} has already been consumed.`);
        }
        const updated: ProductionRun = { ...run, repairAttemptLimit: budget.limit + additionalAttempts,
            repairExtensionApprovalIds: approvals, evidenceIds: [...new Set([...run.evidenceIds, `approval:${approvalId}`])],
            activeRecoveryEpochId: recoveryEpochId, lastHeartbeatAt: this.now().toISOString() };
        this.state.saveProductionRun(updated);
        this.event(updated, "RECOVERY_AUTHORITY_GRANTED",
            `Recovery epoch ${epoch.epochNumber} authorized ${additionalAttempts} additional bounded repair attempt${additionalAttempts === 1 ? "" : "s"}.`, {
                recoveryEpochId, epochNumber: epoch.epochNumber, approvalId, previousLimit: budget.limit,
                repairAttemptLimit: updated.repairAttemptLimit, additionalAttempts
            });
        return updated;
    }

    closeRecoveryEpoch(runId: string, recoveryEpochId: string, outcome: "COMPLETED" | "EXHAUSTED", reason: string): ProductionRun {
        const run = this.requireRun(runId);
        if (run.activeRecoveryEpochId !== recoveryEpochId || !reason.trim()) {
            throw new Error("Recovery epoch closure does not match the active production lineage.");
        }
        const updated: ProductionRun = { ...run, activeRecoveryEpochId: undefined, lastHeartbeatAt: this.now().toISOString() };
        this.state.saveProductionRun(updated);
        this.event(updated, `RECOVERY_EPOCH_${outcome}`,
            `Active recovery epoch ${outcome === "COMPLETED" ? "completed" : "exhausted"}: ${reason}`, {
                recoveryEpochId, outcome, reason, repairAttempts: run.repairAttempts,
                repairAttemptLimit: run.repairAttemptLimit ?? DEFAULT_PRODUCTION_REPAIR_LIMIT
            }, outcome === "EXHAUSTED" ? "WARN" : "INFO");
        return updated;
    }

    recordRepairAttempt(runId: string, classification: string, outcome: "STARTED" | "SUCCEEDED" | "FAILED", maximumAttempts?: number): ProductionRun {
        const run = this.heartbeat(runId);
        const attempts = outcome === "STARTED" ? run.repairAttempts + 1 : run.repairAttempts;
        const limit = maximumAttempts ?? run.repairAttemptLimit ?? DEFAULT_PRODUCTION_REPAIR_LIMIT;
        if (attempts > limit) throw new Error(`Repair limit exhausted for run ${runId} after ${run.repairAttempts}/${limit} attempts.`);
        const updated = { ...run, repairAttempts: attempts };
        this.state.saveProductionRun(updated);
        this.event(updated, `REPAIR_${outcome}`, `Repair ${outcome.toLowerCase()}: ${classification}.`,
            { classification, attempt: attempts, maximumAttempts: limit }, outcome === "FAILED" ? "ERROR" : "INFO");
        return updated;
    }

    recordExecutionPlan(runId: string, plan: ProductionExecutionPlan): ProductionRun {
        if (plan.runId !== runId || !plan.planId.trim() || !plan.missionId.trim()) {
            throw new Error("Execution plan lineage is invalid.");
        }
        const run = this.heartbeat(runId);
        const updated = { ...run, executionPlan: plan };
        this.state.saveProductionRun(updated);
        this.event(updated, "EXECUTION_PLAN_READY", "Machine-readable execution plan recorded.", {
            planId: plan.planId, missionId: plan.missionId, expectedArtifacts: plan.expectedArtifacts
        });
        return updated;
    }

    recordFunctionalAcceptancePlan(runId: string, plan: FunctionalAcceptancePlan): ProductionRun {
        const run = this.heartbeat(runId);
        if (plan.systemId !== run.systemId || plan.repository !== run.repository || plan.branch !== run.currentBranch ||
            plan.commit !== run.currentCommit || !plan.planId.trim() || !plan.productNodeId.trim() || !plan.journeyId.trim()) {
            throw new Error("Functional acceptance plan does not match the active production lineage.");
        }
        const updated: ProductionRun = { ...run, functionalAcceptancePlan: plan };
        this.state.saveProductionRun(updated);
        this.event(updated, "FUNCTIONAL_ACCEPTANCE_PLANNED", "Executable application acceptance plan recorded.", {
            planId: plan.planId, productNodeId: plan.productNodeId, journeyId: plan.journeyId,
            probes: plan.probes.map(item => item.probeId), browserJourneys: plan.browserJourneys.map(item => item.journeyId),
            nativeJourneys: plan.nativeJourneys?.map(item => item.journeyId) ?? []
        });
        return updated;
    }

    attachDurablePreview(runId: string, preview: NonNullable<FunctionalAcceptancePlan["durablePreview"]>): ProductionRun {
        const run = this.heartbeat(runId);
        const current = run.functionalAcceptancePlan;
        if (!current?.previewDeployment || current.previewDeployment.commit !== run.currentCommit ||
            current.previewDeployment.branch !== run.currentBranch || !preview.webUrl || !preview.mobileUrl) {
            throw new Error("Durable preview does not match an authorized exact-revision deployment request.");
        }
        const browserJourneys = current.previewDeployment.browserTarget === "DEPLOYED_PREVIEW"
            ? current.browserJourneys.map(journey => ({ ...journey, command: { ...journey.command,
                publicEnvironment: { ...(journey.command.publicEnvironment ?? {}), PLAYWRIGHT_BASE_URL: preview.webUrl,
                    PBOS_ACCEPTANCE_COMMIT: run.currentCommit } } }))
            : current.browserJourneys;
        const plan: FunctionalAcceptancePlan = { ...current, durablePreview: preview, browserJourneys };
        const updated: ProductionRun = { ...run, functionalAcceptancePlan: plan, lastHeartbeatAt: this.now().toISOString() };
        this.state.saveProductionRun(updated);
        this.event(updated, "PREVIEW_DEPLOYMENT_READY", "Exact-revision durable preview deployment is ready.", {
            provider: current.previewDeployment.provider, webUrl: preview.webUrl, mobileUrl: preview.mobileUrl,
            commit: run.currentCommit, label: preview.label
        });
        return updated;
    }

    updateMissionStatus(systemId: string, missionId: string, status: MissionQueueItem["status"],
        evidenceIds: readonly string[] = []): MissionQueueItem {
        const items = this.state.missionQueue(systemId);
        const current = items.find(item => item.missionId === missionId);
        if (!current) throw new Error(`Mission not found: ${missionId}`);
        if (status === "COMPLETE" && current.completionPolicy?.kind === "FUNCTIONAL_APPLICATION") {
            const run = [...this.state.productionRuns()].reverse().find(item =>
                item.systemId === systemId && item.selectedMission === current.title);
            if (!run) throw new Error(`Functional mission ${missionId} has no production run acceptance evidence.`);
            new FunctionalAcceptanceVerifier().assertCertificationEvidence(current, this.normalizeRun(run));
        }
        const updated = { ...current, status, evidenceIds: [...new Set([...current.evidenceIds, ...evidenceIds])],
            executionBlocker: status === "ACTIVE" || status === "COMPLETE" ? undefined : current.executionBlocker,
            blockedRunId: status === "ACTIVE" || status === "COMPLETE" ? undefined : current.blockedRunId };
        this.reconcileQueue(systemId, items.map(item => item.missionId === missionId ? updated : item));
        return this.state.missionQueue(systemId).find(item => item.missionId === missionId)!;
    }

    blockMissionForRun(runId: string, reason: string, evidenceIds: readonly string[] = []): MissionQueueItem {
        const run = this.requireRun(runId);
        const items = this.state.missionQueue(run.systemId);
        const current = items.find(item => item.title === run.selectedMission);
        if (!current) throw new Error(`Mission for production run ${runId} was not found.`);
        const updated: MissionQueueItem = { ...current, status: "BLOCKED", rationale: `Execution blocked: ${reason}`,
            executionBlocker: reason, blockedRunId: runId,
            evidenceIds: [...new Set([...current.evidenceIds, ...evidenceIds])] };
        this.reconcileQueue(run.systemId, items.map(item => item.missionId === current.missionId ? updated : item));
        this.event(run, "MISSION_EXECUTION_BLOCKED", "Mission selection is blocked until the existing run is recovered.", {
            missionId: current.missionId, reason
        }, "WARN");
        return this.state.missionQueue(run.systemId).find(item => item.missionId === current.missionId)!;
    }

    reconcileQueue(systemId: string, items: readonly MissionQueueItem[]): readonly MissionQueueItem[] {
        const reconciled = new GovernedMissionQueue().reconcile(items);
        this.state.saveMissionQueue(reconciled, systemId);
        return reconciled;
    }

    reconcileMissionExecutionState(systemId: string): readonly MissionQueueItem[] {
        const items = this.state.missionQueue(systemId);
        let updated = [...items];
        for (const mission of items.filter(item => item.status === "ACTIVE" || item.executionBlocker)) {
            const run = [...this.state.productionRuns()].reverse().find(item =>
                item.systemId === systemId && item.selectedMission === mission.title);
            if (!run) {
                if (mission.status === "ACTIVE") {
                    updated = updated.map(item => item.missionId === mission.missionId ? { ...item, status: "BLOCKED" as const,
                        rationale: "Execution blocked: active mission has no durable production run.",
                        executionBlocker: "Active mission has no durable production run." } : item);
                }
                continue;
            }
            if (["BLOCKED", "FAILED", "CANCELLED"].includes(run.status)) {
                updated = updated.map(item => item.missionId === mission.missionId ? { ...item, status: "BLOCKED" as const,
                    rationale: `Execution blocked: ${run.terminalSummary ?? run.status}.`,
                    executionBlocker: run.terminalSummary ?? run.status, blockedRunId: run.runId } : item);
            } else if (["AUTHORIZED", "QUEUED", "STARTING", "RUNNING", "VALIDATING", "REPAIRING",
                "GENERATING_PREVIEW", "AWAITING_APPROVAL", "PAUSED", "RECOVERING"].includes(run.status)) {
                updated = updated.map(item => item.missionId === mission.missionId ? { ...item, status: "ACTIVE" as const,
                    executionBlocker: undefined, blockedRunId: undefined } : item);
            }
        }
        return this.reconcileQueue(systemId, updated);
    }

    activeRun(repository?: string): ProductionRun | undefined {
        const run = [...this.state.productionRuns()].reverse().find(item => ACTIVE.includes(item.status) && (!repository || item.repository === repository));
        return run ? this.normalizeRun(run) : undefined;
    }
    run(runId: string): ProductionRun | undefined {
        const run = this.state.productionRun(runId);
        return run ? this.normalizeRun(run) : undefined;
    }
    history(): readonly ProductionRun[] { return [...this.state.productionRuns()].reverse().map(run => this.normalizeRun(run)); }
    events(runId?: string, afterSequence = 0): readonly ProductionEvent[] {
        return this.state.productionEvents(runId).filter(event => event.sequence > afterSequence);
    }

    pause(runId: string, actorId: string): ProductionRun {
        const run = this.requireActor(runId, actorId);
        if (!["RUNNING", "VALIDATING", "REPAIRING", "GENERATING_PREVIEW"].includes(run.status)) {
            throw new Error(`Run ${runId} cannot pause from ${run.status}.`);
        }
        return this.transition(runId, "PAUSED", "Run paused at a governed checkpoint.", { actorId });
    }

    resume(runId: string, actorId: string): ProductionRun {
        const run = this.requireActor(runId, actorId);
        if (!["PAUSED", "RECOVERING"].includes(run.status)) throw new Error(`Run ${runId} is not resumable from ${run.status}.`);
        if (!this.activeLease(runId)) this.acquireLease(run);
        const activeStage = run.activeStageId
            ? this.state.productionStages(runId).find(stage => stage.stageId === run.activeStageId) : undefined;
        const validationStages: readonly StageType[] = ["VALIDATION", "PREREQUISITE", "APPLICATION_LAUNCH",
            "RUNTIME_VERIFICATION", "BROWSER_JOURNEY", "NATIVE_JOURNEY", "ACCEPTANCE", "PREVIEW"];
        const target: ProductionStatus = activeStage && !validationStages.includes(activeStage.type) ? "RUNNING" : "VALIDATING";
        const resumed = this.transition(runId, target, "Authorized run resumed from its durable checkpoint.", { actorId });
        if (target === "VALIDATING" && !activeStage) {
            this.startStage(runId, "VALIDATION", `Resume validation for ${run.selectedMission}`, {
                recoveryCheckpoint: run.resumeCheckpoint ?? "VALIDATION"
            });
            return this.requireRun(runId);
        }
        return resumed;
    }

    recoverPrematureIndependentValidation(runId: string, remediationRunId: string, headSha: string): ProductionRun {
        const run = this.requireRun(runId);
        if (run.status !== "BLOCKED") return run;
        if (!/^[a-f0-9]{7,40}$/i.test(headSha) || run.currentCommit !== headSha ||
            !run.evidenceIds.includes(`remediation-run:${remediationRunId}`)) {
            throw new Error("Premature validation recovery does not match the governed production lineage.");
        }
        const blocked = [...this.state.productionEvents(runId)].reverse().find(item => item.type === "RUN_BLOCKED");
        if (blocked?.payload.reason !==
            "Functional completion requires at least one independent application check on the exact revision.") {
            throw new Error("The blocked production run is not eligible for automatic independent-validation recovery.");
        }
        return this.recoverBlockedFunctionalValidation(runId, remediationRunId, headSha,
            "PREMATURE_INDEPENDENT_VALIDATION_TERMINAL");
    }

    recoverBlockedFunctionalValidation(runId: string, remediationRunId: string, headSha: string,
        recovery = "FUNCTIONAL_ACCEPTANCE_RETRY"): ProductionRun {
        const run = this.requireRun(runId);
        if (run.status !== "BLOCKED") return run;
        const mission = this.state.missionQueue(run.systemId).find(item => item.title === run.selectedMission);
        if (mission?.completionPolicy?.kind !== "FUNCTIONAL_APPLICATION") {
            throw new Error("Only a functional application mission can use functional validation recovery.");
        }
        if (!/^[a-f0-9]{7,40}$/i.test(headSha) || run.currentCommit !== headSha ||
            !run.evidenceIds.includes(`remediation-run:${remediationRunId}`)) {
            throw new Error("Functional validation recovery does not match the governed production lineage.");
        }
        return this.recoverBlockedValidation(runId, remediationRunId, headSha, recovery);
    }

    recoverBlockedValidation(runId: string, remediationRunId: string, headSha: string,
        recovery = "VALIDATION_RETRY"): ProductionRun {
        const run = this.requireRun(runId);
        if (run.status !== "BLOCKED") return run;
        const budget = this.repairBudget(runId);
        if (budget.remaining === 0) {
            throw new Error(`Run ${runId} exhausted its bounded repair budget (${budget.attempts}/${budget.limit}); verified operator approval is required to continue.`);
        }
        if (!/^[a-f0-9]{7,40}$/i.test(headSha) || run.currentCommit !== headSha ||
            !run.evidenceIds.includes(`remediation-run:${remediationRunId}`)) {
            throw new Error("Validation recovery does not match the governed production lineage.");
        }
        const mission = this.state.missionQueue(run.systemId).find(item => item.title === run.selectedMission);
        this.transition(runId, "RECOVERING",
            "Recovering a blocked run at the last exact-revision validation checkpoint.", {
                remediationRunId, headSha, recovery
        });
        if (mission) this.updateMissionStatus(run.systemId, mission.missionId, "ACTIVE");
        this.resume(runId, run.actorId);
        return this.requireRun(runId);
    }

    cancel(runId: string, actorId: string): ProductionRun {
        const run = this.requireActor(runId, actorId);
        if (isTerminalProductionStatus(run.status)) throw new Error(`Run ${runId} is already terminal.`);
        return this.transition(runId, "CANCELLED", "Run cancelled by an authorized operator.", { actorId });
    }

    verifyIntegrity(): Readonly<{ valid: boolean; errors: readonly string[]; checkedAt: string }> {
        const errors: string[] = [];
        const events = this.state.productionEvents();
        events.forEach((event, index) => {
            if (index > 0 && event.sequence <= events[index - 1].sequence) errors.push(`Event sequence is not increasing at ${event.eventId}.`);
            if (!this.state.productionRun(event.runId)) errors.push(`Event ${event.eventId} references missing run ${event.runId}.`);
        });
        this.state.productionRuns().filter(run => LEASE_REQUIRED.includes(run.status)).forEach(run => {
            if (!this.activeLease(run.runId)) errors.push(`Active run ${run.runId} has no active execution lease.`);
        });
        return { valid: errors.length === 0, errors, checkedAt: this.now().toISOString() };
    }

    recoverStaleRuns(): readonly ProductionRun[] {
        const recovered: ProductionRun[] = [];
        for (const lease of this.state.executionLeases().filter(item => item.status === "ACTIVE" && Date.parse(item.expiresAt) <= this.now().getTime())) {
            this.state.saveExecutionLease({ ...lease, status: "STALE", recoveryMetadata: { classifiedAt: this.now().toISOString() } });
            const run = this.requireRun(lease.runId);
            if (ACTIVE.includes(run.status)) {
                const activeStage = run.activeStageId
                    ? this.state.productionStages(run.runId).find(stage => stage.stageId === run.activeStageId) : undefined;
                if (activeStage && !activeStage.completedAt) {
                    this.failStage(activeStage.stageId,
                        "Execution was interrupted after its cross-process lease expired; no acceptance result was recorded.");
                }
                const current = this.requireRun(lease.runId);
                const updated = { ...current, status: "RECOVERING" as const, activeStageId: undefined,
                    lastHeartbeatAt: this.now().toISOString(),
                    resumeCheckpoint: activeStage?.type ?? run.activeStageId ?? "RUN_START" };
                this.state.saveProductionRun(updated); this.event(updated, "RUN_RECOVERY_REQUIRED", "Stale execution lease requires deterministic recovery.", { leaseId: lease.leaseId }, "WARN");
                recovered.push(updated);
            }
        }
        return recovered;
    }

    health(): RuntimeHealthReport {
        const active = this.activeRun(); const lease = active ? this.activeLease(active.runId) : undefined;
        const heartbeatAge = active ? this.now().getTime() - Date.parse(active.lastHeartbeatAt) : 0;
        const components: RuntimeHealthReport["components"] = [
            { component: "PERSISTENCE", health: "HEALTHY", detail: "Canonical Genesis state is readable." },
            { component: "EVENT_STREAM", health: "HEALTHY", detail: `${this.state.productionEvents().length} durable events.` },
            { component: "EXECUTION_LEASE", health: !active || !LEASE_REQUIRED.includes(active.status) ? "HEALTHY" : lease && heartbeatAge <= this.leaseTtlMs ? "HEALTHY" : "UNHEALTHY",
                detail: !active || !LEASE_REQUIRED.includes(active.status) ? "Current state does not require a mutation lease." : lease ? `Heartbeat age ${heartbeatAge}ms.` : "Active mutation has no lease." },
            { component: "MISSION_QUEUE", health: "HEALTHY", detail: `${this.state.missionQueue().filter(item => item.status === "ELIGIBLE").length} eligible missions.` },
            { component: "ARTIFACT_STORAGE", health: "HEALTHY", detail: `${this.state.previewManifests().length} preview manifests are readable.` },
            { component: "CONTEXT_VALIDATOR", health: "UNKNOWN", detail: "No active context-validation probe is attached." },
            { component: "MISSION_SELECTOR", health: this.state.missionQueue().length ? "HEALTHY" : "UNKNOWN", detail: this.state.missionQueue().length ? "Dependency graph is reconciled." : "Mission queue has not been initialized." },
            { component: "EXECUTION_ADAPTER", health: active ? "HEALTHY" : "UNKNOWN", detail: active ? "A production run is observable." : "No active execution to probe." },
            { component: "TEST_RUNNER", health: active?.validationResults.length ? "HEALTHY" : "UNKNOWN", detail: active?.validationResults.length ? "Validation evidence is attached." : "No current validation evidence." },
            { component: "PREVIEW_SERVICE", health: this.state.previewManifests(active?.runId).at(-1)?.status === "READY" ? "HEALTHY" : "UNKNOWN", detail: "Health follows exact-commit preview evidence." },
            { component: "CERTIFICATION_SERVICE", health: active?.status === "CERTIFIED" || this.history().some(run => run.status === "CERTIFIED") ? "HEALTHY" : "UNKNOWN", detail: "Health follows durable certification evidence." }
        ];
        const health = components.some(item => item.health === "UNHEALTHY") ? "UNHEALTHY"
            : components.some(item => item.health === "DEGRADED") ? "DEGRADED"
            : components.some(item => item.health === "UNKNOWN") ? "UNKNOWN" : "HEALTHY";
        return { health, checkedAt: this.now().toISOString(), components };
    }

    metrics(): RuntimeMetrics {
        const runs = this.state.productionRuns(); const durations = runs.map(run => run.durationMs).filter((value): value is number => value !== undefined).sort((a,b) => a-b);
        return { runsStarted: runs.length, runsCompleted: runs.filter(run => ["COMPLETED", "CERTIFIED"].includes(run.status)).length,
            runsFailed: runs.filter(run => run.status === "FAILED").length, runsBlocked: runs.filter(run => run.status === "BLOCKED").length,
            runsRecovered: this.state.productionEvents().filter(event => event.type === "RUN_RECOVERY_REQUIRED").length,
            totalDurationMs: durations.reduce((sum, value) => sum + value, 0), medianDurationMs: durations.length ? durations[Math.floor(durations.length / 2)] : 0,
            repairAttempts: runs.reduce((sum, run) => sum + run.repairAttempts, 0),
            certificationRate: runs.length ? runs.filter(run => run.status === "CERTIFIED").length / runs.length : 0,
            queueDepth: this.state.missionQueue().filter(item => ["QUEUED", "ELIGIBLE"].includes(item.status)).length,
            activeRunCount: runs.filter(run => ACTIVE.includes(run.status)).length,
            staleLeaseCount: this.state.executionLeases().filter(lease => lease.status === "STALE").length };
    }

    snapshot(): MissionControlSnapshot {
        const activeRun = this.activeRun(); const history = this.history();
        const queue = new GovernedMissionQueue(); const items = this.state.missionQueue();
        return { connection: "CONNECTED", status: activeRun?.status ?? "IDLE", activeRun,
            activeStage: activeRun?.activeStageId ? this.state.productionStages(activeRun.runId).find(stage => stage.stageId === activeRun.activeStageId) : undefined,
            activeLease: activeRun ? this.activeLease(activeRun.runId) : undefined,
            lastRun: history.find(run => run.runId !== activeRun?.runId), history: history.slice(0, 20),
            latestPreview: this.state.previewManifests(activeRun?.runId).at(-1) ?? this.state.previewManifests().at(-1),
            applicationPreviews: this.applicationPreviews(), applicationDeliveries: this.applicationDeliveryProofs(),
            nextMission: queue.next(items),
            recentEvents: this.state.productionEvents(activeRun?.runId).slice(-100), health: this.health(), metrics: this.metrics(),
            generatedAt: this.now().toISOString(), sourceVersion: "PBOS-PRODUCTION-RUNTIME-1" };
    }

    applicationPreviews(): readonly MissionControlApplicationPreview[] {
        const runs = new Map(this.state.productionRuns().map(run => [run.runId, run]));
        const systems = new Map(this.state.systems().map(system => [system.systemId, system]));
        const latest = new Map<string, MissionControlApplicationPreview>();
        this.state.previewManifests().forEach(preview => {
            const run = runs.get(preview.runId);
            if (!run || preview.status !== "READY" || !["LIVE", "SEEDED"].includes(preview.label) ||
                preview.repository !== run.repository || preview.commit !== run.currentCommit ||
                (!preview.webUrl && !preview.mobileUrl)) return;
            const system = systems.get(run.systemId);
            latest.set(run.systemId, { systemId: run.systemId, systemName: system?.name ?? run.systemId,
                repository: run.repository, runId: run.runId, commit: run.currentCommit, status: "READY",
                label: preview.label as "LIVE" | "SEEDED", webUrl: preview.webUrl, mobileUrl: preview.mobileUrl,
                generatedAt: preview.generatedAt });
        });
        return [...latest.values()].sort((left, right) => left.systemName.localeCompare(right.systemName));
    }

    applicationDeliveryProofs(): readonly ApplicationDeliveryProof[] {
        const runs = new Map(this.state.productionRuns().map(run => [run.runId, run]));
        return this.applicationPreviews().flatMap(preview => {
            const run = runs.get(preview.runId);
            const durable = run?.functionalAcceptancePlan?.durablePreview;
            const dimensions = new Set(run?.acceptanceEvidence.filter(item => item.passed &&
                item.repository === preview.repository && item.commit === preview.commit).map(item => item.dimension));
            const required = ["ROUTE", "USER_INTERFACE", "ACCEPTANCE_TEST", "INDEPENDENT_VALIDATION", "PREVIEW"] as const;
            if (!run || !["AWAITING_APPROVAL", "CERTIFIED"].includes(run.status) || !preview.webUrl || !preview.mobileUrl ||
                !durable || durable.webUrl !== preview.webUrl || durable.mobileUrl !== preview.mobileUrl ||
                required.some(dimension => !dimensions.has(dimension))) return [];
            return [{ ...preview, deliveryState: run.status === "CERTIFIED" ? "CERTIFIED" as const : "VALIDATED" as const,
                evidenceIds: run.acceptanceEvidence.filter(item => item.passed && item.commit === preview.commit)
                    .map(item => item.evidenceId) }];
        });
    }

    private acquireLease(run: ProductionRun): ExecutionLease {
        const healthy = this.state.executionLeases().find(lease => lease.status === "ACTIVE" && lease.repository === run.repository && Date.parse(lease.expiresAt) > this.now().getTime());
        if (healthy) throw new Error(`Healthy execution lease ${healthy.leaseId} is owned by run ${healthy.runId}.`);
        const timestamp = this.now().toISOString();
        const lease: ExecutionLease = { leaseId: randomUUID(), runId: run.runId, processId: process.pid, host: hostname(), actorId: run.actorId,
            acquiredAt: timestamp, lastRenewedAt: timestamp, expiresAt: new Date(this.now().getTime() + this.leaseTtlMs).toISOString(),
            scope: `repository:${run.repository}`, repository: run.repository, branch: run.currentBranch, commit: run.currentCommit, status: "ACTIVE" };
        this.state.saveExecutionLease(lease); this.event(run, "LEASE_ACQUIRED", "Execution lease acquired.", { leaseId: lease.leaseId }); return lease;
    }

    private releaseLease(runId: string, method: NonNullable<ExecutionLease["releaseMethod"]>): void {
        const lease = this.activeLease(runId); if (!lease) return;
        this.state.saveExecutionLease({ ...lease, status: "RELEASED", releaseMethod: method, lastRenewedAt: this.now().toISOString() });
        this.event(this.requireRun(runId), "LEASE_RELEASED", "Execution lease released.", { leaseId: lease.leaseId, method });
    }
    private activeLease(runId: string): ExecutionLease | undefined {
        return [...this.state.executionLeases()].reverse().find(lease => lease.runId === runId && lease.status === "ACTIVE");
    }
    private requireRun(runId: string): ProductionRun {
        const run = this.state.productionRun(runId);
        if (!run) throw new Error(`Production run not found: ${runId}`);
        return this.normalizeRun(run);
    }
    private normalizeRun(run: ProductionRun): ProductionRun {
        return { ...run, acceptanceEvidence: run.acceptanceEvidence ?? [] };
    }
    private requireActor(runId: string, actorId: string): ProductionRun {
        const run = this.requireRun(runId);
        if (run.actorId !== actorId) throw new Error(`Operator ${actorId} does not own run ${runId}.`);
        return run;
    }
    private event(run: ProductionRun, type: string, summary: string, payload: Readonly<Record<string, unknown>>,
        severity: ProductionEvent["severity"] = "INFO", parentEntityId = run.runId): void {
        const events = this.state.productionEvents();
        const event: ProductionEvent = { eventId: randomUUID(), sequence: (events.at(-1)?.sequence ?? 0) + 1, type,
            timestamp: this.now().toISOString(), runId: run.runId, parentEntityId, actorId: run.actorId, severity,
            status: run.status, summary, payload: this.redactPayload(payload), repository: run.repository,
            branch: run.currentBranch, commit: run.currentCommit, correlationId: run.runId, traceId: run.parentRunId };
        this.state.appendProductionEvent(event);
    }
    private redact(value: string): string { return value.replace(/(token|secret|password|authorization)=?\s*[^\s]+/gi, "$1=[REDACTED]"); }
    private redactPayload(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
        return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key,
            /token|secret|password|authorization/i.test(key) ? "[REDACTED]" : typeof value === "string" ? this.redact(value) : value]));
    }
}
