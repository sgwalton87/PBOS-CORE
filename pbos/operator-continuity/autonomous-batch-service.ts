import { randomUUID } from "crypto";
import { GenesisBuildPlan } from "../build-planning";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GenesisStateRepository } from "../genesis-state";
import { PullRequestReference } from "../platform";
import { RemediationState } from "../validation-automation";
import { AutonomousBuildBatch, AutonomousBatchState, BatchTelemetryEvent, BatchTelemetryReporter, BatchTelemetryType } from "./contracts";
import { ApplicationAcceptanceDimension, FunctionalAcceptanceVerifier, MissionCompletionPolicy, ProductionRuntimeService } from "../production-runtime";
import { PLAYBOOK_LAUNCH_TASKS } from "../launch-readiness/playbook-launch-plan";

const FUNCTIONAL_DIMENSIONS: readonly ApplicationAcceptanceDimension[] = [
    "ROUTE", "USER_INTERFACE", "DURABLE_DATA", "AUTHORITY", "PBOS_INTEGRATION", "ACCEPTANCE_TEST",
    "ACCESSIBILITY", "SECURITY", "INDEPENDENT_VALIDATION"
];

function completionPolicy(task: (typeof PLAYBOOK_LAUNCH_TASKS)[number]): MissionCompletionPolicy {
    if (["048-repository-gap-analysis", "048-foundation", "049-mobile-foundation", "050-platform-evidence", "050-isolation"].includes(task.taskId)) {
        return { kind: "PLATFORM_ARTIFACT", requiredDimensions: [], acceptanceCriteria: task.acceptanceCriteria };
    }
    const previewRequired = ["048-web-staging", "049-store-readiness", "049-certification", "050-certification"].includes(task.taskId);
    return { kind: "FUNCTIONAL_APPLICATION",
        requiredDimensions: previewRequired ? [...FUNCTIONAL_DIMENSIONS, "PREVIEW"] : FUNCTIONAL_DIMENSIONS,
        acceptanceCriteria: task.acceptanceCriteria };
}

export class AutonomousBatchService implements BatchTelemetryReporter {
    constructor(private readonly state: GenesisStateRepository, private readonly production = new ProductionRuntimeService(state)) {}

    start(session: GenesisBuildSession, plan: GenesisBuildPlan, packageLimit: number,
        pullRequest: PullRequestReference, runId: string, batchId: string = randomUUID(), currentCommit?: string,
        changedPaths: readonly string[] = []): AutonomousBuildBatch {
        if (!Number.isInteger(packageLimit) || packageLimit < 1 || packageLimit > 10) {
            throw new Error("Autonomous package authorization must be between 1 and 10.");
        }
        const selected = plan.workPackages.slice(0, packageLimit);
        if (selected.length === 0) throw new Error("Autonomous batch requires at least one work package.");
        const now = new Date().toISOString();
        const batch: AutonomousBuildBatch = {
            batchId, systemId: session.system.systemId, sessionId: session.sessionId,
            planId: plan.planId, packageLimit, workPackages: selected.map(item => ({ workPackageId: item.id, title: item.title })),
            branch: pullRequest.branch, pullRequestUrl: pullRequest.url, runId, state: "VALIDATING",
            createdAt: now, updatedAt: now
        };
        this.state.saveAutonomousBatch(batch);
        if (this.production.run(batchId)) {
            if (currentCommit) this.production.updateRepositoryPosition(batchId, pullRequest.branch, currentCommit);
            if (changedPaths.length) this.production.recordFiles(batchId, { modified: changedPaths });
            this.production.completeActiveStage(batchId, { branch: pullRequest.branch, pullRequest: pullRequest.url });
            this.production.transition(batchId, "VALIDATING", "GitHub Actions validation started.", { pullRequest: pullRequest.url });
            this.production.startStage(batchId, "VALIDATION", "Validate autonomous batch", { pullRequest: pullRequest.url });
        }
        this.record(batch, "VALIDATION_STARTED", "Batch validation started", `GitHub Actions validation started for ${pullRequest.url}.`);
        return batch;
    }

    beginBatch(systemId: string, sessionId: string, workPackages: readonly { readonly id: string; readonly title: string }[],
        context?: Readonly<{ repository: string; branch: string; commit: string; objective: string; mission: string }>): string {
        const batchId = randomUUID();
        const eventContext = { batchId, systemId, sessionId };
        const session = this.state.sessions().find(item => item.sessionId === sessionId);
        if (context && session) {
            this.production.begin({ runId: batchId, systemId, actorId: session.grant.issuedBy,
                authorizationArtifactId: session.grant.issuanceApprovalId, repository: context.repository,
                branch: context.branch, commit: context.commit, objective: context.objective, mission: context.mission,
                rationale: "Selected deterministically from incomplete governed work packages." });
            this.production.transition(batchId, "QUEUED", "Authorized production run entered the mission queue.");
            this.production.transition(batchId, "STARTING", "Production execution is starting.");
            this.production.transition(batchId, "RUNNING", "Autonomous work-package execution started.");
            this.production.startStage(batchId, "EXECUTION", "Compile governed work packages", { workPackageIds: workPackages.map(item => item.id) });
        }
        this.append(eventContext, "BATCH_STARTED", "Autonomous batch started", `${workPackages.length} work packages authorized for execution.`);
        workPackages.forEach(item => this.append(eventContext, "WORK_PACKAGE_QUEUED", item.title, `Work package ${item.id} entered the governed execution queue.`, item.id));
        return batchId;
    }

    packageStarted(batchId: string, systemId: string, sessionId: string, workPackageId: string, title: string): void {
        this.append({ batchId, systemId, sessionId }, "WORK_PACKAGE_STARTED", title, "PBOS began compiling this work package into the governed application change set.", workPackageId);
    }

    packageCompleted(batchId: string, systemId: string, sessionId: string, workPackageId: string, title: string): void {
        this.append({ batchId, systemId, sessionId }, "WORK_PACKAGE_COMPLETED", title, "The work package change set and acceptance evidence were prepared.", workPackageId);
        this.append({ batchId, systemId, sessionId }, "SECTION_COMPLETED", `${title} section complete`, "This section is included in the batch awaiting validation and final human approval.", workPackageId);
    }

    latest(systemId?: string): AutonomousBuildBatch | undefined {
        return [...this.state.autonomousBatches()].reverse().find(batch => !systemId || batch.systemId === systemId);
    }

    telemetry(batchId: string): readonly BatchTelemetryEvent[] {
        return this.state.batchTelemetry(batchId);
    }

    productionTelemetry(batchId: string): readonly import("../production-runtime").ProductionEvent[] {
        return this.production.events(batchId);
    }

    productionState(batchId: string): Readonly<{ run?: import("../production-runtime").ProductionRun;
        stage?: import("../production-runtime").ProductionStage }> {
        const run = this.production.run(batchId);
        return { run, stage: run?.activeStageId
            ? this.state.productionStages(batchId).find(stage => stage.stageId === run.activeStageId) : undefined };
    }

    heartbeat(batchId: string): void {
        const run = this.production.run(batchId);
        if (run && !["BLOCKED", "FAILED", "COMPLETED", "CERTIFIED", "CANCELLED"].includes(run.status)) this.production.heartbeat(batchId);
    }

    updateForValidation(runId: string, validation: RemediationState): AutonomousBuildBatch | undefined {
        const batch = [...this.state.autonomousBatches()].reverse().find(item => item.runId === runId);
        if (!batch) return undefined;
        const state: AutonomousBatchState = validation === "READY_FOR_CERTIFICATION" ? "READY_FOR_CERTIFICATION"
            : validation === "BLOCKED" ? "BLOCKED"
            : validation === "WAITING_FOR_INFRASTRUCTURE" ? "WAITING_FOR_INFRASTRUCTURE"
            : validation === "REMEDIATION_REQUIRED" || validation === "REMEDIATION_PUSHED" ? "REMEDIATING" : "VALIDATING";
        const updated = { ...batch, state, updatedAt: new Date().toISOString() };
        this.state.saveAutonomousBatch(updated);
        const productionRun = this.production.run(batch.batchId);
        if (productionRun) {
            this.production.heartbeat(batch.batchId);
            if (state === "REMEDIATING" && productionRun.status === "VALIDATING") {
                this.production.completeActiveStage(batch.batchId, { validation: "REMEDIATION_REQUIRED" });
                this.production.transition(batch.batchId, "REPAIRING", "Bounded deterministic remediation started.");
                this.production.recordRepairAttempt(batch.batchId, `Validation state ${validation}`, "STARTED");
                this.production.startStage(batch.batchId, "REPAIR", "Repair deterministic validation failure");
            } else if (state === "VALIDATING" && productionRun.status === "REPAIRING") {
                this.production.completeActiveStage(batch.batchId, { repair: "APPLIED" });
                this.production.recordRepairAttempt(batch.batchId, "Deterministic remediation applied", "SUCCEEDED");
                this.production.transition(batch.batchId, "VALIDATING", "Validation resumed after remediation.");
                this.production.startStage(batch.batchId, "VALIDATION", "Revalidate remediated batch");
            } else if (state === "READY_FOR_CERTIFICATION" && productionRun.status === "VALIDATING") {
                const validationStartedAt = this.productionState(batch.batchId).stage?.startedAt ?? productionRun.lastHeartbeatAt;
                this.production.completeActiveStage(batch.batchId, { validation: "PASSED" });
                this.production.recordValidation(batch.batchId, "GitHub Actions validation", true,
                    Math.max(0, Date.now() - Date.parse(validationStartedAt)), `remediation-run:${runId}`);
                this.production.transition(batch.batchId, "AWAITING_APPROVAL", "Validation passed; human certification is required.");
            } else if (state === "BLOCKED" && !["BLOCKED", "FAILED", "CANCELLED"].includes(productionRun.status)) {
                this.production.completeActiveStage(batch.batchId, { validation: "BLOCKED" });
                this.production.transition(batch.batchId, "BLOCKED", "Autonomous batch requires human intervention.");
            }
        }
        const last = this.state.batchTelemetry(batch.batchId).at(-1)?.type;
        const event = state === "READY_FOR_CERTIFICATION" ? "BATCH_READY_FOR_APPROVAL"
            : state === "BLOCKED" ? "BATCH_BLOCKED" : state === "REMEDIATING" ? "REMEDIATION_STARTED"
            : state === "WAITING_FOR_INFRASTRUCTURE" ? "INFRASTRUCTURE_WAIT" : undefined;
        if (event && last !== event) this.record(updated, event,
            event === "BATCH_READY_FOR_APPROVAL" ? "Entire batch ready for human approval"
                : event === "BATCH_BLOCKED" ? "Batch blocked"
                : event === "INFRASTRUCTURE_WAIT" ? "External validation infrastructure unavailable"
                : "Automatic remediation started",
            event === "BATCH_READY_FOR_APPROVAL" ? `${updated.workPackages.length} work packages completed validation.`
                : event === "INFRASTRUCTURE_WAIT" ? "PBOS preserved exact-revision lineage and used no application repair attempt."
                : `Validation state changed to ${validation}.`);
        return updated;
    }

    certify(batchId: string, approvalId: string): void {
        const run = this.production.run(batchId);
        if (!run || run.status === "CERTIFIED") return;
        if (run.status !== "AWAITING_APPROVAL") throw new Error(`Batch ${batchId} is not awaiting certification.`);
        this.production.transition(batchId, "CERTIFIED", "Human certification granted and governed merge evidence confirmed.", { approvalId });
    }

    prepareReadinessQueue(systemId: string, governedRevision: string): import("../production-runtime").MissionQueueItem | undefined {
        if (systemId !== "PLAYBOOK-SYSTEM-001") return undefined;
        const readinessTasks = PLAYBOOK_LAUNCH_TASKS.filter(task => ["CIP-048", "CIP-049", "CIP-050"].includes(task.cip));
        const ids = new Set(readinessTasks.map(task => task.taskId));
        const existing = new Map(this.state.missionQueue(systemId).map(item => [item.missionId, item]));
        const foundation = existing.get("playbook-capability-foundation");
        const items: import("../production-runtime").MissionQueueItem[] = [
            { missionId: "playbook-capability-foundation", systemId, title: "Certified Playbook capability foundation",
                dependencies: [], status: foundation?.status ?? "COMPLETE", rationale: `Seven capabilities proven at ${governedRevision}.`,
                approvalRequired: false, evidenceIds: foundation?.evidenceIds ?? [`repository:${governedRevision}`] },
            ...readinessTasks.map(task => {
                const prior = existing.get(task.taskId);
                const policy = completionPolicy(task);
                let status = prior?.status ?? "QUEUED" as const;
                if (status === "COMPLETE" && policy.kind === "FUNCTIONAL_APPLICATION") {
                    const run = [...this.state.productionRuns()].reverse().find(item =>
                        item.systemId === systemId && item.selectedMission === task.title && item.status === "CERTIFIED");
                    try {
                        if (!run) throw new Error("missing certified production run");
                        new FunctionalAcceptanceVerifier().assertCertificationEvidence({ ...prior!, completionPolicy: policy },
                            { ...run, acceptanceEvidence: run.acceptanceEvidence ?? [] });
                    } catch {
                        status = "QUEUED";
                    }
                }
                return { missionId: task.taskId, systemId, title: task.title,
                    dependencies: [...new Set(task.dependencies.length
                    ? task.dependencies.map(dependency => ids.has(dependency) ? dependency : "playbook-capability-foundation")
                    : ["playbook-capability-foundation"])],
                    status, rationale: prior?.rationale ?? "Awaiting dependency reconciliation.",
                    approvalRequired: task.gate !== "AUTOMATED", evidenceIds: prior?.evidenceIds ?? [], completionPolicy: policy };
            })
        ];
        this.production.reconcileQueue(systemId, items);
        return this.production.snapshot().nextMission;
    }

    private record(batch: AutonomousBuildBatch, type: BatchTelemetryType, title: string, detail: string): void {
        this.append(batch, type, title, detail);
    }
    private append(context: { batchId: string; systemId: string; sessionId: string }, type: BatchTelemetryType,
        title: string, detail: string, workPackageId?: string): void {
        const event: BatchTelemetryEvent = { eventId: randomUUID(), batchId: context.batchId, systemId: context.systemId,
            sessionId: context.sessionId, type, workPackageId, title, detail, occurredAt: new Date().toISOString() };
        this.state.appendBatchTelemetry(event);
        this.state.appendAudit({ eventId: event.eventId, type: `BATCH_TELEMETRY_${type}`, actorId: context.systemId,
            resource: context.batchId, occurredAt: event.occurredAt, evidence: { event } });
    }
}
