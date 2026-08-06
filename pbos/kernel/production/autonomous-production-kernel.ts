import { GenesisStateRepository } from "../../genesis-state";
import { ApplicationAcceptanceEvidence, FunctionalAcceptanceVerifier, FunctionalApplicationRuntime,
    FunctionalRuntimeResult, ProductionRun, ProductionRuntimeService } from "../../production-runtime";

export function classifyFunctionalAcceptanceFailure(error: unknown): string {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (["prerequisite", "dependency", "lockfile", "command not found", "enoent"].some(signal => message.includes(signal))) {
        return "DEPENDENCY_PREPARATION_FAILURE";
    }
    if (["exited before becoming healthy", "did not become healthy", "launch script"].some(signal => message.includes(signal))) {
        return "APPLICATION_LAUNCH_FAILURE";
    }
    if (message.includes("runtime probes")) return "RUNTIME_PROBE_FAILURE";
    if (["native journey", "ios", "android", "expo export"].some(signal => message.includes(signal))) {
        return "NATIVE_ACCEPTANCE_FAILURE";
    }
    if (["browser", "playwright", "acceptance report", "test:acceptance"].some(signal => message.includes(signal))) {
        return "BROWSER_ACCEPTANCE_FAILURE";
    }
    if (["free bytes", "disk space", "no space left", "enospc"].some(signal => message.includes(signal))) {
        return "RUNTIME_RESOURCE_FAILURE";
    }
    if (message.includes("preview")) return "PREVIEW_VERIFICATION_FAILURE";
    return "FUNCTIONAL_ACCEPTANCE_FAILURE";
}

/**
 * PBS-5000 execution authority for the post-engineering product proof.
 * Adapters may prepare code and plans; only this kernel path may turn executable
 * application observations into functional acceptance and certification readiness.
 */
export class AutonomousProductionKernel {
    constructor(private readonly state: GenesisStateRepository,
        private readonly production = new ProductionRuntimeService(state),
        private readonly application = new FunctionalApplicationRuntime()) {}

    async verifyApplication(runId: string,
        independentValidation: ApplicationAcceptanceEvidence): Promise<Readonly<{ run: ProductionRun; result: FunctionalRuntimeResult }>> {
        const existing = this.production.run(runId);
        const run = existing?.functionalAcceptancePlan
            ? this.production.normalizeFunctionalAcceptanceLineage(runId)
            : existing;
        if (!run || run.status !== "VALIDATING") throw new Error(`Run ${runId} is not ready for functional application verification.`);
        const mission = this.state.missionQueue(run.systemId).find(item => item.title === run.selectedMission);
        if (mission?.completionPolicy?.kind !== "FUNCTIONAL_APPLICATION") {
            throw new Error(`Run ${runId} is not governed by a functional application completion policy.`);
        }
        const plan = run.functionalAcceptancePlan;
        if (!plan) throw new Error(`Run ${runId} has no executable functional acceptance plan.`);
        if (independentValidation.dimension !== "INDEPENDENT_VALIDATION" || independentValidation.source !== "CI_VALIDATION" ||
            independentValidation.repository !== run.repository || independentValidation.commit !== run.currentCommit ||
            !independentValidation.passed) {
            throw new Error("Independent validation evidence does not match the active application revision.");
        }

        this.production.completeActiveStage(runId, { validation: "PASSED", commit: independentValidation.commit },
            [independentValidation.evidenceId]);
        this.production.recordValidation(runId, "Independent exact-revision validation", true, 0,
            independentValidation.evidenceId);
        this.production.startStage(runId, "PREREQUISITE", `Prepare ${mission.title}`, {
            planId: plan.planId, productNodeId: plan.productNodeId, journeyId: plan.journeyId
        });
        try {
            const result = await this.application.execute(runId, plan, (event, detail) => {
                this.production.completeActiveStage(runId, detail);
                if (event === "PREREQUISITES_VERIFIED") {
                    this.production.startStage(runId, "APPLICATION_LAUNCH", `Launch ${mission.title}`, detail);
                } else if (event === "APPLICATION_HEALTHY") {
                    this.production.startStage(runId, "RUNTIME_VERIFICATION", `Verify runtime for ${mission.title}`, detail);
                } else if (event === "RUNTIME_PROBES_VERIFIED") {
                    this.production.startStage(runId, "BROWSER_JOURNEY", `Execute browser journeys for ${mission.title}`, detail);
                } else if (event === "BROWSER_JOURNEYS_VERIFIED") {
                    this.production.startStage(runId, plan.nativeJourneys?.length ? "NATIVE_JOURNEY" : "ACCEPTANCE",
                        plan.nativeJourneys?.length ? `Execute native journeys for ${mission.title}` : `Accept ${mission.title}`, detail);
                } else if (event === "NATIVE_JOURNEYS_VERIFIED") {
                    this.production.startStage(runId, "ACCEPTANCE", `Accept ${mission.title}`, detail);
                } else if (event === "DURABLE_PREVIEW_VERIFIED") {
                    this.production.startStage(runId, "PREVIEW", `Verify durable preview for ${mission.title}`, detail);
                }
            });
            this.production.recordAcceptanceEvidence(runId, [...result.evidence, independentValidation]);
            this.production.recordPreview(result.preview);
            this.production.completeActiveStage(runId, {
                productNodeId: plan.productNodeId, journeyId: plan.journeyId,
                probes: result.probes.length, browserJourneys: result.journeys.length,
                nativeJourneys: result.nativeJourneys.length
            }, [...result.evidence.map(item => item.evidenceId), independentValidation.evidenceId]);
            const accepted = this.production.run(runId)!;
            new FunctionalAcceptanceVerifier().assertCertificationEvidence(mission, accepted);
            const awaitingApproval = this.production.acceptFunctionalApplication(runId,
                "Runtime, browser, native, accessibility, security, and functional acceptance passed on the exact application revision.", {
                    productNodeId: plan.productNodeId, journeyId: plan.journeyId, previewId: result.preview.previewId
                });
            return { run: awaitingApproval, result };
        } catch (error) {
            const classification = classifyFunctionalAcceptanceFailure(error);
            const reason = error instanceof Error ? error.message : String(error);
            const current = this.production.run(runId);
            if (current?.activeStageId) this.production.failStage(current.activeStageId,
                reason);
            const latest = this.production.run(runId);
            if (latest?.status === "VALIDATING") {
                const budget = this.production.repairBudget(runId);
                if (budget.remaining === 0) {
                    const terminal = `${reason}\nPBOS bounded repair budget exhausted after ${budget.attempts}/${budget.limit} attempts; verified operator approval is required to continue.`;
                    this.production.blockMissionForRun(runId, reason);
                    this.production.transition(runId, "BLOCKED",
                        `Functional acceptance blocked after ${budget.attempts}/${budget.limit} repair attempts: ${reason}`, {
                            reason, classification, repairAttempts: budget.attempts, repairAttemptLimit: budget.limit
                        });
                    throw new Error(terminal, { cause: error });
                }
                this.production.transition(runId, "REPAIRING", "Functional application acceptance failed; bounded repair is required.", {
                    reason, classification
                });
                this.production.recordRepairAttempt(runId, classification, "STARTED");
            }
            const repairing = this.production.run(runId);
            if (repairing?.status === "REPAIRING") {
                this.production.recordRepairAttempt(runId, classification, "FAILED");
                this.production.blockMissionForRun(runId, reason);
                this.production.transition(runId, "BLOCKED",
                    "Functional application acceptance failed and requires governed remediation.", { reason });
            }
            throw error;
        }
    }
}
