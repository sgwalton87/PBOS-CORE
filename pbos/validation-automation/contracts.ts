import { PullRequestReference } from "../platform";

export type CheckState = "PENDING" | "PASSED" | "FAILED" | "SKIPPED" | "INFRASTRUCTURE_WAIT";
export interface PullRequestCheckEvidence {
    readonly evidenceId: string;
    readonly name: string;
    readonly state: CheckState;
    readonly detailsUrl?: string;
    readonly failureLog?: string;
    readonly externalRunId?: string;
    readonly externalAttempt?: number;
    readonly infrastructureReason?: string;
    readonly collectedAt: string;
}
export type PullRequestLifecycleState = "OPEN" | "CLOSED" | "MERGED";
export type RemediationState = "WAITING_FOR_CHECKS" | "WAITING_FOR_INFRASTRUCTURE" | "REMEDIATION_REQUIRED" |
    "REMEDIATION_PUSHED" | "READY_FOR_CERTIFICATION" | "BLOCKED";
export interface RemediationRun {
    readonly runId: string;
    readonly systemId: string;
    readonly pullRequest: PullRequestReference;
    readonly headSha: string;
    readonly pullRequestState?: PullRequestLifecycleState;
    readonly mergeCommitSha?: string;
    readonly mergedValidationRevision?: string;
    readonly mergedValidationRequestedAt?: string;
    readonly attempt: number;
    readonly maximumAttempts: number;
    readonly state: RemediationState;
    readonly evidence: readonly PullRequestCheckEvidence[];
    readonly failureFingerprint?: string;
    readonly remediationRevision?: string;
    readonly infrastructureRetries?: number;
    readonly maximumInfrastructureRetries?: number;
    readonly lastInfrastructureFailureKey?: string;
    readonly nextInfrastructureRetryAt?: string;
    readonly blockers: readonly string[];
    readonly updatedAt: string;
}
export interface RemediationChangeSet {
    readonly summary: string;
    readonly files: readonly { path: string; content: string }[];
    readonly replacements?: readonly { path: string; search: string; replacement: string }[];
    readonly prepareDependencyLock?: boolean;
}
