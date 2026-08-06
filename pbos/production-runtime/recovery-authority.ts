import { randomUUID } from "crypto";
import { GenesisStateRepository } from "../genesis-state";
import { ProductionRecoveryEpoch, RecoveryRepairRecord } from "./contracts";
import { ProductionRuntimeService } from "./production-runtime-service";

export type RecoveryApprovalVerifier = (approvalId: string, actorId: string, runId: string) => boolean;

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

/**
 * PBS-5000 Recovery Authority creates a new bounded epoch without replacing
 * the production run, mission, evidence, repair history, or repository lineage.
 */
export class ProductionRecoveryAuthority {
    constructor(private readonly state: GenesisStateRepository,
        private readonly production = new ProductionRuntimeService(state),
        private readonly now: () => Date = () => new Date()) {}

    request(runId: string): ProductionRecoveryEpoch {
        const run = this.state.productionRun(runId);
        if (!run || run.status !== "BLOCKED") throw new Error(`Recovery Authority requires a blocked production run: ${runId}.`);
        const budget = this.production.repairBudget(runId);
        if (budget.remaining > 0) throw new Error(`Run ${runId} still has bounded repair capacity.`);
        const existing = this.state.productionRecoveryEpochs(runId).find(epoch => epoch.status === "AWAITING_AUTHORIZATION");
        if (existing) return existing;

        const epochs = this.state.productionRecoveryEpochs(runId);
        const previous = epochs.at(-1);
        if (previous?.status === "ACTIVE") this.exhaust(previous,
            `Recovery epoch ${previous.epochNumber} consumed its authorized repair capacity without functional acceptance.`);
        const mission = this.state.missionQueue(run.systemId).find(item => item.title === run.selectedMission);
        if (!mission) throw new Error(`Recovery Authority cannot resolve existing mission ${run.selectedMission}.`);
        const stages = this.state.productionStages(runId);
        const events = this.state.productionEvents(runId);
        const repairs: RecoveryRepairRecord[] = events.filter(event => event.type === "REPAIR_STARTED").map(start => {
            const attempt = number(start.payload.attempt) ?? 0;
            const classification = text(start.payload.classification) ?? "UNCLASSIFIED";
            const outcome = events.find(event => event.sequence > start.sequence &&
                ["REPAIR_SUCCEEDED", "REPAIR_FAILED"].includes(event.type) &&
                number(event.payload.attempt) === attempt && text(event.payload.classification) === classification);
            return { attempt, classification, startedAt: start.timestamp, startedEventId: start.eventId,
                outcome: outcome?.type === "REPAIR_SUCCEEDED" ? "SUCCEEDED" : outcome?.type === "REPAIR_FAILED" ? "FAILED" : "UNKNOWN",
                outcomeAt: outcome?.timestamp, outcomeEventId: outcome?.eventId };
        });
        const latestFailure = [...stages].reverse().find(stage => stage.status === "FAILED")?.error;
        const defects = [...new Set([latestFailure, mission.executionBlocker, run.terminalSummary, ...run.blockers]
            .filter((item): item is string => Boolean(item?.trim())))];
        if (defects.length === 0) defects.push("Functional acceptance has not produced exact-revision certification evidence.");
        const remediationRunIds = run.evidenceIds.filter(item => item.startsWith("remediation-run:"))
            .map(item => item.slice("remediation-run:".length));
        const requestedAt = this.now().toISOString();
        const epoch: ProductionRecoveryEpoch = {
            recoveryEpochId: randomUUID(), epochNumber: (previous?.epochNumber ?? 0) + 1, runId, systemId: run.systemId,
            missionId: mission.missionId, missionTitle: mission.title, status: "AWAITING_AUTHORIZATION",
            reasonBudgetExhausted: `${budget.attempts}/${budget.limit} bounded repair attempts were consumed. ${run.terminalSummary ?? defects[0]}`,
            attemptedRepairs: repairs,
            repositoryState: { repository: run.repository, branch: run.currentBranch, commit: run.currentCommit, remediationRunIds },
            runtimeState: { status: run.status, activeStageId: run.activeStageId, lastHeartbeatAt: run.lastHeartbeatAt,
                repairAttempts: budget.attempts, repairAttemptLimit: budget.limit,
                stageStatuses: stages.map(stage => ({ stageId: stage.stageId, type: stage.type, status: stage.status, error: stage.error })) },
            remainingDefects: defects, lineageEvidenceIds: [...run.evidenceIds], previousRecoveryEpochId: previous?.recoveryEpochId,
            requestedAt, requestedBy: run.actorId
        };
        this.state.saveProductionRecoveryEpoch(epoch);
        this.production.registerRecoveryEpoch(runId, epoch.recoveryEpochId);
        return epoch;
    }

    authorize(recoveryEpochId: string, approvalId: string, actorId: string,
        verify: RecoveryApprovalVerifier, additionalAttempts = 1): ProductionRecoveryEpoch {
        const epoch = this.requireEpoch(recoveryEpochId);
        if (epoch.status !== "AWAITING_AUTHORIZATION" || !verify(approvalId, actorId, epoch.runId)) {
            throw new Error("Recovery epoch requires explicit verifiable operator authorization.");
        }
        if (additionalAttempts !== 1) throw new Error("Each recovery epoch authorizes exactly one bounded repair attempt.");
        const authorizedAt = this.now().toISOString();
        const authorized: ProductionRecoveryEpoch = { ...epoch, status: "AUTHORIZED", authorizationApprovalId: approvalId,
            authorizedAt, additionalAttempts };
        this.state.saveProductionRecoveryEpoch(authorized);
        try {
            this.production.activateRecoveryEpoch(epoch.runId, recoveryEpochId, approvalId, actorId, additionalAttempts);
        } catch (error) {
            this.state.saveProductionRecoveryEpoch(epoch);
            throw error;
        }
        const active = { ...authorized, status: "ACTIVE" as const };
        this.state.saveProductionRecoveryEpoch(active);
        return active;
    }

    completeActive(runId: string, reason: string): ProductionRecoveryEpoch | undefined {
        const run = this.state.productionRun(runId);
        if (!run?.activeRecoveryEpochId) return undefined;
        const epoch = this.requireEpoch(run.activeRecoveryEpochId);
        const completed = { ...epoch, status: "COMPLETED" as const, completedAt: this.now().toISOString(), completionReason: reason,
            lineageEvidenceIds: [...new Set([...epoch.lineageEvidenceIds, ...run.evidenceIds])] };
        this.state.saveProductionRecoveryEpoch(completed);
        this.production.closeRecoveryEpoch(runId, epoch.recoveryEpochId, "COMPLETED", reason);
        return completed;
    }

    private exhaust(epoch: ProductionRecoveryEpoch, reason: string): ProductionRecoveryEpoch {
        const exhausted = { ...epoch, status: "EXHAUSTED" as const, completedAt: this.now().toISOString(), completionReason: reason };
        this.state.saveProductionRecoveryEpoch(exhausted);
        this.production.closeRecoveryEpoch(epoch.runId, epoch.recoveryEpochId, "EXHAUSTED", reason);
        return exhausted;
    }

    private requireEpoch(recoveryEpochId: string): ProductionRecoveryEpoch {
        const epoch = this.state.productionRecoveryEpoch(recoveryEpochId);
        if (!epoch) throw new Error(`Recovery epoch not found: ${recoveryEpochId}`);
        return epoch;
    }
}
