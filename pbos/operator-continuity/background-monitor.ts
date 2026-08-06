import { randomUUID } from "crypto";
import { closeSync, mkdirSync, openSync } from "fs";
import { spawn } from "child_process";
import { execFile } from "child_process";
import { promisify } from "util";
import { GenesisWorkflowService } from "../genesis-console/genesis-workflow-service";
import { GenesisStateRepository } from "../genesis-state";
import { ResumableRemediationEngine } from "../validation-automation";
import { BackgroundMonitorJob } from "./contracts";
import { OperatorMemoService } from "./operator-memo-service";
import { AutonomousBatchService } from "./autonomous-batch-service";
import { ApplicationAcceptanceEvidence, ProductionRecoveryAuthority, ProductionRuntimeService } from "../production-runtime";
import { RemediationRun } from "../validation-automation";
import { AutonomousProductionKernel } from "../kernel";
import { GovernedPreviewDeploymentGateway, PreviewDeploymentGateway, VercelPreviewDeploymentGateway } from "../production-runtime";

export interface OperatorNotifier { notify(title: string, message: string): Promise<void>; }
export class DesktopOperatorNotifier implements OperatorNotifier {
    async notify(title: string, message: string): Promise<void> {
        if (process.platform !== "darwin") return;
        const escape = (value: string) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
        await promisify(execFile)("osascript", ["-e", `display notification "${escape(message)}" with title "${escape(title)}"`]);
    }
}

export class BackgroundProcessLauncher {
    constructor(private readonly executable: string, private readonly state: GenesisStateRepository, private readonly logRoot: string) {}
    launch(systemId: string, sessionId: string, runId: string): BackgroundMonitorJob {
        const existing = this.state.backgroundJobForRun(runId);
        if (existing?.status === "RUNNING" && this.alive(existing.pid)) return existing;
        mkdirSync(this.logRoot, { recursive: true, mode: 0o700 });
        const logPath = `${this.logRoot}/${runId}.log`;
        const output = openSync(logPath, "a", 0o600);
        const child = spawn(process.execPath, [this.executable, "monitor", runId, sessionId], { detached: true, stdio: ["ignore", output, output] });
        child.unref(); closeSync(output);
        const now = new Date().toISOString();
        const job: BackgroundMonitorJob = { jobId: randomUUID(), systemId, sessionId, runId, pid: child.pid ?? -1,
            logPath, status: "RUNNING", startedAt: now, updatedAt: now };
        this.state.saveBackgroundJob(job);
        return job;
    }
    private alive(pid: number): boolean {
        if (pid <= 0) return false;
        try { process.kill(pid, 0); return true; } catch { return false; }
    }
}

export class BackgroundMonitor {
    constructor(private readonly state: GenesisStateRepository, private readonly remediation: ResumableRemediationEngine,
        private readonly workflows: GenesisWorkflowService, private readonly memos: OperatorMemoService,
        private readonly wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
        private readonly batches = new AutonomousBatchService(state), private readonly notifier: OperatorNotifier = new DesktopOperatorNotifier(),
        private readonly previewDeployment: PreviewDeploymentGateway =
            new GovernedPreviewDeploymentGateway(new VercelPreviewDeploymentGateway()),
        private readonly applicationVerifier: Pick<AutonomousProductionKernel, "verifyApplication"> =
            new AutonomousProductionKernel(state, new ProductionRuntimeService(state))) {}

    async run(runId: string, sessionId: string, intervalMs = 10_000, maximumPolls = 360): Promise<void> {
        const session = this.state.sessions().find(item => item.sessionId === sessionId);
        if (!session) throw new Error(`Background session not found: ${sessionId}`);
        try {
            let previousState: RemediationRun["state"] | undefined;
            for (let poll = 0; poll < maximumPolls; poll += 1) {
                const result = await this.remediation.resume(runId, run => this.workflows.authorizeRemediation(session, run.pullRequest.branch));
                await this.reconcileProductionMission(result);
                this.memos.write(session, result);
                const batch = this.batches.updateForValidation(runId, result.state);
                if (result.state === "WAITING_FOR_INFRASTRUCTURE" && previousState !== result.state) {
                    await this.notify("PBOS Genesis — Infrastructure wait",
                        `${session.system.name}: GitHub Actions did not execute validation. PBOS preserved the exact revision and will retry without consuming an application repair attempt.`);
                }
                previousState = result.state;
                if (["READY_FOR_CERTIFICATION", "BLOCKED"].includes(result.state)) {
                    this.completeJob(runId, result.state === "BLOCKED" ? "BLOCKED" : "COMPLETED");
                    const label = result.state === "READY_FOR_CERTIFICATION" ? "ready for certification" : "blocked";
                    await this.notify("PBOS Genesis — Build update",
                        `${session.system.name}: ${batch ? `${batch.workPackages.length} work packages` : "foundation mission"} ${label}. ${result.pullRequest.url}`);
                    return;
                }
                await this.wait(intervalMs);
            }
            throw new Error("Background monitor reached its polling limit; resume from PBOS.");
        } catch (error) {
            this.completeJob(runId, "BLOCKED");
            const batch = this.batches.updateForValidation(runId, "BLOCKED");
            await this.notify("PBOS Genesis — Build blocked",
                `${session.system.name}: batch ${batch?.batchId ?? runId} requires operator review. ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    private async notify(title: string, message: string): Promise<void> {
        try { await this.notifier.notify(title, message); } catch { /* Notification failure never changes governed build state. */ }
    }

    private completeJob(runId: string, status: BackgroundMonitorJob["status"]): void {
        const job = this.state.backgroundJobForRun(runId);
        if (job) this.state.saveBackgroundJob({ ...job, status, updatedAt: new Date().toISOString() });
    }

    private async reconcileProductionMission(remediation: RemediationRun): Promise<void> {
        const remediationRunId = remediation.runId;
        const validation = remediation.state;
        const production = new ProductionRuntimeService(this.state);
        const linkedRun = [...this.state.productionRuns()].reverse().find(item =>
            item.evidenceIds.includes(`remediation-run:${remediationRunId}`));
        if (!linkedRun) return;
        let run = linkedRun;
        if (run.status === "BLOCKED") {
            if (!["READY_FOR_CERTIFICATION", "REMEDIATION_PUSHED"].includes(validation)) return;
            const selectedMission = run.selectedMission;
            const blockedMission = this.state.missionQueue(run.systemId).find(item => item.title === selectedMission);
            const replacementRevision = validation === "READY_FOR_CERTIFICATION"
                ? remediation.headSha : remediation.remediationRevision;
            if (!replacementRevision || !/^[a-f0-9]{7,40}$/i.test(replacementRevision)) {
                throw new Error("Blocked-run recovery requires the exact replacement pull-request revision.");
            }
            if (run.currentCommit !== replacementRevision) {
                run = run.functionalAcceptancePlan
                    ? production.rebindRepositoryAfterRemediation(run.runId, remediationRunId,
                        remediation.pullRequest.branch, replacementRevision)
                    : production.updateRepositoryPosition(run.runId, remediation.pullRequest.branch, replacementRevision);
            }
            run = blockedMission?.completionPolicy?.kind === "FUNCTIONAL_APPLICATION"
                ? production.recoverBlockedFunctionalValidation(run.runId, remediationRunId, replacementRevision)
                : production.recoverBlockedValidation(run.runId, remediationRunId, replacementRevision);
        }
        if (run.status !== "VALIDATING") return;
        production.heartbeat(run.runId);
        if (validation === "REMEDIATION_PUSHED") {
            const revision = remediation.remediationRevision;
            if (!revision || !/^[a-f0-9]{7,40}$/i.test(revision)) {
                throw new Error("Remediation completed without an exact replacement revision.");
            }
            if (run.currentCommit !== revision) run = run.functionalAcceptancePlan
                ? production.rebindRepositoryAfterRemediation(run.runId, remediationRunId,
                    remediation.pullRequest.branch, revision)
                : production.updateRepositoryPosition(run.runId, remediation.pullRequest.branch, revision);
        }
        if (validation === "READY_FOR_CERTIFICATION") {
            try {
                if (!/^[a-f0-9]{7,40}$/i.test(remediation.headSha) || remediation.headSha !== run.currentCommit) {
                    throw new Error(`Validation lineage mismatch: PBOS built ${run.currentCommit}, but GitHub validated ${remediation.headSha}.`);
                }
                const checkNames = remediation.evidence.filter(item => item.state === "PASSED").map(item => item.name);
                const mission = this.state.missionQueue(run.systemId).find(item => item.title === run.selectedMission);
                if (mission?.completionPolicy?.kind === "FUNCTIONAL_APPLICATION" && checkNames.length === 0) {
                    throw new Error("Functional completion requires at least one independent application check on the exact revision.");
                }
                const validationEvidence: ApplicationAcceptanceEvidence = {
                    evidenceId: `independent-validation:${remediation.headSha}`,
                    dimension: "INDEPENDENT_VALIDATION",
                    behavior: `Independent GitHub checks passed for the exact application revision: ${checkNames.join(", ") || "governed check suite"}.`,
                    repository: run.repository,
                    commit: remediation.headSha,
                    artifact: `${remediation.pullRequest.url}#checks`,
                    passed: true,
                    source: "CI_VALIDATION"
                };
                if (mission?.completionPolicy?.kind === "FUNCTIONAL_APPLICATION") {
                    const plan = run.functionalAcceptancePlan;
                    if (mission.completionPolicy.requiredDimensions.includes("PREVIEW") && plan?.previewDeployment && !plan.durablePreview) {
                        const deploymentApproval = this.state.audit().some(event => event.eventId === plan.previewDeployment!.approvalId &&
                            event.resource === mission.missionId && event.evidence.purpose === "START_PRODUCTION_MISSION");
                        if (!deploymentApproval) throw new Error("Protected staging deployment is missing its durable mission approval.");
                        const preview = await this.previewDeployment.deploy(plan);
                        run = production.attachDurablePreview(run.runId, preview);
                    }
                    await this.applicationVerifier.verifyApplication(run.runId, validationEvidence);
                    new ProductionRecoveryAuthority(this.state, production).completeActive(run.runId,
                        "Independent exact-revision validation and functional application acceptance passed.");
                    return;
                }
                production.recordAcceptanceEvidence(run.runId, [validationEvidence]);
                production.completeActiveStage(run.runId, { validation: "PASSED", remediationRunId },
                    [`remediation-run:${remediationRunId}`]);
                production.recordValidation(run.runId, "GitHub Actions validation", true, 0,
                    `remediation-run:${remediationRunId}`);
                production.transition(run.runId, "AWAITING_APPROVAL",
                    "Exact-revision functional acceptance evidence passed; human certification and merge approval are required.");
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                const current = production.run(run.runId);
                if (current?.activeStageId) production.completeActiveStage(run.runId, { validation: "BLOCKED", remediationRunId });
                if (current && !["BLOCKED", "FAILED", "CANCELLED"].includes(current.status)) {
                    production.transition(run.runId, "BLOCKED", `Functional acceptance blocked: ${reason}`, {
                        remediationRunId, reason
                    });
                }
                production.blockMissionForRun(run.runId, reason, [`remediation-run:${remediationRunId}`]);
                if (production.repairBudget(run.runId).remaining === 0) {
                    new ProductionRecoveryAuthority(this.state, production).request(run.runId);
                }
                throw error;
            }
        } else if (validation === "BLOCKED") {
            production.completeActiveStage(run.runId, { validation: "BLOCKED", remediationRunId },
                [`remediation-run:${remediationRunId}`]);
            production.transition(run.runId, "BLOCKED", "Foundation validation requires human intervention.");
            production.blockMissionForRun(run.runId, "Independent validation requires human remediation.",
                [`remediation-run:${remediationRunId}`]);
        } else if (validation === "REMEDIATION_REQUIRED" || validation === "REMEDIATION_PUSHED") {
            production.completeActiveStage(run.runId, { validation, remediationRunId });
            production.transition(run.runId, "REPAIRING", "Deterministic validation remediation is active.");
            production.recordRepairAttempt(run.runId, `Validation state ${validation}`, "STARTED");
            production.transition(run.runId, "VALIDATING", "Validation resumed after deterministic remediation.");
            production.startStage(run.runId, "VALIDATION", "Revalidate Playbook foundation", { remediationRunId });
        }
    }

}
