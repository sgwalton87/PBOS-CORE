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
    constructor(private readonly state: GenesisStateRepository, private readonly checks: GitHubCheckCollector, private readonly handler: RemediationHandler) {}

    start(systemId: string, pullRequest: PullRequestReference, maximumAttempts = 5): RemediationRun {
        const run: RemediationRun = { runId: randomUUID(), systemId, pullRequest, headSha: "UNKNOWN", attempt: 0,
            maximumAttempts, state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() };
        this.state.saveRemediationRun(run);
        return run;
    }

    latest(systemId: string): RemediationRun | undefined {
        return this.state.remediationRuns().filter(run => run.systemId === systemId)
            .sort((left, right) => right.pullRequest.number - left.pullRequest.number ||
                right.updatedAt.localeCompare(left.updatedAt))[0];
    }

    async resume(runId: string, beforeApply?: (run: RemediationRun) => void): Promise<RemediationRun> {
        const current = this.state.remediationRun(runId);
        if (!current) throw new Error(`Remediation run not found: ${runId}`);
        if (["READY_FOR_CERTIFICATION", "BLOCKED"].includes(current.state)) return current;
        const collected = await this.checks.collect(current.pullRequest);
        if (collected.evidence.length === 0 || collected.evidence.some(item => item.state === "PENDING")) {
            return this.save({ ...current, headSha: collected.headSha, state: "WAITING_FOR_CHECKS", evidence: collected.evidence });
        }
        const failures = collected.evidence.filter(item => item.state === "FAILED");
        if (failures.length === 0) return this.save({ ...current, headSha: collected.headSha, state: "READY_FOR_CERTIFICATION", evidence: collected.evidence });
        const fingerprint = this.checks.fingerprint(collected.evidence);
        if (current.attempt >= current.maximumAttempts || (current.attempt > 0 && current.failureFingerprint === fingerprint)) {
            return this.save({ ...current, headSha: collected.headSha, state: "BLOCKED", evidence: collected.evidence,
                failureFingerprint: fingerprint, blockers: ["Identical validation failure repeated without a new revision; human review required."] });
        }
        const requiringRemediation = this.save({ ...current, headSha: collected.headSha, state: "REMEDIATION_REQUIRED",
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

    private save(run: RemediationRun): RemediationRun {
        const updated = { ...run, updatedAt: new Date().toISOString() };
        this.state.saveRemediationRun(updated);
        this.state.appendAudit({ eventId: randomUUID(), type: "VALIDATION_REMEDIATION_STATE", actorId: run.systemId,
            resource: run.pullRequest.url, occurredAt: updated.updatedAt, evidence: { run: updated } });
        return updated;
    }
}
