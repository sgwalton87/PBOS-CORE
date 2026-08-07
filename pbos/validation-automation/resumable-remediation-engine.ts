import { randomUUID } from "crypto";
import { PullRequestReference } from "../platform";
import { GenesisStateRepository } from "../genesis-state";
import { GitHubCheckCollector } from "./github-check-collector";
import { RemediationChangeSet, RemediationRun } from "./contracts";

export interface RemediationHandler {
    propose(run: RemediationRun): Promise<RemediationChangeSet | undefined>;
    apply(run: RemediationRun, changes: RemediationChangeSet): Promise<string>;
}

export class ResumableRemediationEngine {
    constructor(private readonly state: GenesisStateRepository, private readonly checks: GitHubCheckCollector,
        private readonly handler: RemediationHandler, private readonly now: () => Date = () => new Date(),
        private readonly infrastructureRetryDelayMs = 60_000, private readonly mergedValidationWaitMs = 10 * 60_000) {}

    start(systemId: string, pullRequest: PullRequestReference, maximumAttempts = 5): RemediationRun {
        const run: RemediationRun = { runId: randomUUID(), systemId, pullRequest, headSha: "UNKNOWN", attempt: 0,
            maximumAttempts, state: "WAITING_FOR_CHECKS", evidence: [], infrastructureRetries: 0,
            maximumInfrastructureRetries: 3, blockers: [], updatedAt: this.now().toISOString() };
        this.state.saveRemediationRun(run);
        return run;
    }

    latest(systemId: string): RemediationRun | undefined {
        return this.state.remediationRuns().filter(run => run.systemId === systemId)
            .sort((left, right) => right.pullRequest.number - left.pullRequest.number ||
                right.updatedAt.localeCompare(left.updatedAt))[0];
    }

    async resume(runId: string, beforeApply?: (run: RemediationRun) => void): Promise<RemediationRun> {
        const persisted = this.state.remediationRun(runId);
        if (!persisted) throw new Error(`Remediation run not found: ${runId}`);
        // Legacy runs predate durable pull-request lifecycle metadata. Recollect them once so PBOS can
        // discover an out-of-band merge instead of leaving the production mission pinned to a closed branch.
        if (persisted.state === "BLOCKED" && persisted.pullRequestState && persisted.pullRequestState !== "MERGED") {
            return persisted;
        }
        const falselyReady = persisted.state === "READY_FOR_CERTIFICATION" &&
            !persisted.evidence.some(item => item.state === "PASSED");
        const current = falselyReady ? this.save({ ...persisted, state: "WAITING_FOR_CHECKS",
            blockers: ["Independent validation has not reported a passing check for the exact revision."] }) : persisted;
        const collected = await this.checks.collect(current.pullRequest);
        const lifecycle = { pullRequestState: collected.pullRequestState, mergeCommitSha: collected.mergeCommitSha };
        if (collected.pullRequestState === "CLOSED") {
            return this.save({ ...current, ...lifecycle, headSha: collected.headSha, state: "BLOCKED",
                evidence: collected.evidence,
                blockers: ["The pull request was closed without merge. PBOS will not validate or mutate its abandoned branch; recover the existing mission on a new governed pull request."] });
        }
        const mergedWithoutPassingValidation = collected.pullRequestState === "MERGED" &&
            collected.evidence.every(item => item.state === "SKIPPED");
        if (collected.evidence.length === 0 || collected.evidence.some(item => item.state === "PENDING") ||
            mergedWithoutPassingValidation) {
            if (collected.pullRequestState === "MERGED" &&
                (collected.evidence.length === 0 || mergedWithoutPassingValidation)) {
                const alreadyRequested = current.mergedValidationRevision === collected.headSha &&
                    Boolean(current.mergedValidationRequestedAt);
                if (!alreadyRequested) {
                    try {
                        await this.checks.requestMergedValidation(current.pullRequest, collected.baseRefName, collected.headSha);
                    } catch (error) {
                        return this.save({ ...current, ...lifecycle, headSha: collected.headSha, state: "BLOCKED",
                            evidence: collected.evidence, blockers: [
                                `Merged revision validation could not start: ${error instanceof Error ? error.message : String(error)}`
                            ] });
                    }
                    return this.save({ ...current, ...lifecycle, headSha: collected.headSha,
                        mergedValidationRevision: collected.headSha, mergedValidationRequestedAt: this.now().toISOString(),
                        state: "WAITING_FOR_CHECKS", evidence: collected.evidence, blockers: [
                            `PBOS dispatched governed CI for merged revision ${collected.headSha}; waiting for exact-revision evidence.`
                        ] });
                }
                const elapsed = this.now().getTime() - Date.parse(current.mergedValidationRequestedAt!);
                return this.save({ ...current, ...lifecycle, headSha: collected.headSha,
                    state: elapsed >= this.mergedValidationWaitMs ? "BLOCKED" : "WAITING_FOR_CHECKS",
                    evidence: collected.evidence,
                    blockers: [elapsed >= this.mergedValidationWaitMs
                        ? `Merged revision ${collected.headSha} did not start independent validation within the bounded wait; inspect the governed CI workflow.`
                        : `PBOS already dispatched governed CI for merged revision ${collected.headSha}; waiting for exact-revision evidence.`] });
            }
            return this.save({ ...current, ...lifecycle, headSha: collected.headSha, state: "WAITING_FOR_CHECKS",
                evidence: collected.evidence, blockers: [] });
        }
        const infrastructure = collected.evidence.filter(item => item.state === "INFRASTRUCTURE_WAIT");
        if (infrastructure.length > 0) {
            return this.waitForInfrastructure({ ...current, ...lifecycle }, collected.headSha, collected.evidence, infrastructure[0]);
        }
        const failures = collected.evidence.filter(item => item.state === "FAILED");
        const passed = collected.evidence.filter(item => item.state === "PASSED");
        if (failures.length === 0 && passed.length === 0) {
            return this.save({ ...current, ...lifecycle, headSha: collected.headSha, state: "WAITING_FOR_CHECKS",
                evidence: collected.evidence,
                blockers: ["GitHub reported only skipped checks; PBOS is waiting for an independent passing check."] });
        }
        if (failures.length === 0) return this.save({ ...current, ...lifecycle, headSha: collected.headSha,
            state: "READY_FOR_CERTIFICATION", evidence: collected.evidence, blockers: [] });
        const fingerprint = this.checks.fingerprint(collected.evidence);
        if (current.attempt >= current.maximumAttempts || (current.attempt > 0 && current.headSha === collected.headSha &&
            current.failureFingerprint === fingerprint)) {
            return this.save({ ...current, ...lifecycle, headSha: collected.headSha, state: "BLOCKED", evidence: collected.evidence,
                failureFingerprint: fingerprint, blockers: ["Identical validation failure repeated without a new revision; human review required."] });
        }
        if (collected.pullRequestState === "MERGED") {
            return this.save({ ...current, ...lifecycle, headSha: collected.headSha, state: "BLOCKED",
                evidence: collected.evidence, failureFingerprint: fingerprint,
                blockers: ["The merged revision failed independent validation. PBOS will not mutate a closed pull-request branch; create a governed recovery change on a new branch."] });
        }
        const requiringRemediation = this.save({ ...current, ...lifecycle, headSha: collected.headSha, state: "REMEDIATION_REQUIRED",
            evidence: collected.evidence, failureFingerprint: fingerprint });
        const changes = await this.handler.propose(requiringRemediation);
        if (!changes) return this.save({ ...requiringRemediation, state: "BLOCKED", blockers: ["No deterministic remediation is registered for the collected failure evidence."] });
        beforeApply?.(requiringRemediation);
        let revision: string;
        try {
            revision = await this.handler.apply(requiringRemediation, changes);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            return this.save({ ...requiringRemediation, state: "BLOCKED", blockers: [`Remediation application failed: ${reason}`] });
        }
        return this.save({ ...requiringRemediation, attempt: current.attempt + 1, state: "REMEDIATION_PUSHED",
            remediationRevision: revision, blockers: [], updatedAt: new Date().toISOString() });
    }

    private async waitForInfrastructure(current: RemediationRun, headSha: string,
        evidence: RemediationRun["evidence"], interrupted: RemediationRun["evidence"][number]): Promise<RemediationRun> {
        const retries = current.infrastructureRetries ?? 0;
        const maximum = current.maximumInfrastructureRetries ?? 3;
        const failureKey = `${interrupted.externalRunId ?? "UNKNOWN"}:${interrupted.externalAttempt ?? "UNKNOWN"}`;
        const nextRetryAt = current.nextInfrastructureRetryAt ? Date.parse(current.nextInfrastructureRetryAt) : 0;
        if (current.lastInfrastructureFailureKey === failureKey && this.now().getTime() < nextRetryAt) {
            return this.save({ ...current, headSha, state: "WAITING_FOR_INFRASTRUCTURE", evidence,
                blockers: [`GitHub Actions infrastructure interrupted validation before any step ran. PBOS will retry after ${current.nextInfrastructureRetryAt}.`] });
        }
        if (retries >= maximum) {
            return this.save({ ...current, headSha, state: "BLOCKED", evidence,
                blockers: [`GitHub Actions infrastructure retry budget exhausted (${retries}/${maximum}); application repair attempts remain unchanged.`] });
        }
        let retryResult = "The exact-revision workflow retry was requested automatically.";
        try {
            await this.checks.retryInfrastructure(interrupted);
        } catch (error) {
            retryResult = `The retry request was not accepted: ${error instanceof Error ? error.message : String(error)}`;
        }
        const retryAt = new Date(this.now().getTime() + this.infrastructureRetryDelayMs).toISOString();
        return this.save({ ...current, headSha, state: "WAITING_FOR_INFRASTRUCTURE", evidence,
            infrastructureRetries: retries + 1, maximumInfrastructureRetries: maximum,
            lastInfrastructureFailureKey: failureKey, nextInfrastructureRetryAt: retryAt,
            blockers: [`GitHub Actions infrastructure wait ${retries + 1}/${maximum}. ${retryResult} No application remediation was consumed.`] });
    }

    private save(run: RemediationRun): RemediationRun {
        const updated = { ...run, updatedAt: this.now().toISOString() };
        this.state.saveRemediationRun(updated);
        this.state.appendAudit({ eventId: randomUUID(), type: "VALIDATION_REMEDIATION_STATE", actorId: run.systemId,
            resource: run.pullRequest.url, occurredAt: updated.updatedAt, evidence: { run: updated } });
        return updated;
    }
}
