import { randomUUID } from "crypto";
import { GenesisBuildPlan } from "../build-planning";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GenesisStateRepository } from "../genesis-state";
import { PullRequestReference } from "../platform";
import { RemediationState } from "../validation-automation";
import { AutonomousBuildBatch, AutonomousBatchState, BatchTelemetryEvent, BatchTelemetryReporter, BatchTelemetryType } from "./contracts";

export class AutonomousBatchService implements BatchTelemetryReporter {
    constructor(private readonly state: GenesisStateRepository) {}

    start(session: GenesisBuildSession, plan: GenesisBuildPlan, packageLimit: number,
        pullRequest: PullRequestReference, runId: string, batchId: string = randomUUID()): AutonomousBuildBatch {
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
        this.record(batch, "VALIDATION_STARTED", "Batch validation started", `GitHub Actions validation started for ${pullRequest.url}.`);
        return batch;
    }

    beginBatch(systemId: string, sessionId: string, workPackages: readonly { readonly id: string; readonly title: string }[]): string {
        const batchId = randomUUID();
        const context = { batchId, systemId, sessionId };
        this.append(context, "BATCH_STARTED", "Autonomous batch started", `${workPackages.length} work packages authorized for execution.`);
        workPackages.forEach(item => this.append(context, "WORK_PACKAGE_QUEUED", item.title, `Work package ${item.id} entered the governed execution queue.`, item.id));
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

    updateForValidation(runId: string, validation: RemediationState): AutonomousBuildBatch | undefined {
        const batch = [...this.state.autonomousBatches()].reverse().find(item => item.runId === runId);
        if (!batch) return undefined;
        const state: AutonomousBatchState = validation === "READY_FOR_CERTIFICATION" ? "READY_FOR_CERTIFICATION"
            : validation === "BLOCKED" ? "BLOCKED"
            : validation === "REMEDIATION_REQUIRED" || validation === "REMEDIATION_PUSHED" ? "REMEDIATING" : "VALIDATING";
        const updated = { ...batch, state, updatedAt: new Date().toISOString() };
        this.state.saveAutonomousBatch(updated);
        const last = this.state.batchTelemetry(batch.batchId).at(-1)?.type;
        const event = state === "READY_FOR_CERTIFICATION" ? "BATCH_READY_FOR_APPROVAL"
            : state === "BLOCKED" ? "BATCH_BLOCKED" : state === "REMEDIATING" ? "REMEDIATION_STARTED" : undefined;
        if (event && last !== event) this.record(updated, event,
            event === "BATCH_READY_FOR_APPROVAL" ? "Entire batch ready for human approval" : event === "BATCH_BLOCKED" ? "Batch blocked" : "Automatic remediation started",
            event === "BATCH_READY_FOR_APPROVAL" ? `${updated.workPackages.length} work packages completed validation.` : `Validation state changed to ${validation}.`);
        return updated;
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
