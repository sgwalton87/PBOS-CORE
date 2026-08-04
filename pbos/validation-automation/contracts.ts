import { PullRequestReference } from "../platform";

export type CheckState = "PENDING" | "PASSED" | "FAILED" | "SKIPPED";
export interface PullRequestCheckEvidence {
    readonly evidenceId: string;
    readonly name: string;
    readonly state: CheckState;
    readonly detailsUrl?: string;
    readonly failureLog?: string;
    readonly collectedAt: string;
}
export type RemediationState = "WAITING_FOR_CHECKS" | "REMEDIATION_REQUIRED" | "REMEDIATION_PUSHED" | "READY_FOR_CERTIFICATION" | "BLOCKED";
export interface RemediationRun {
    readonly runId: string;
    readonly systemId: string;
    readonly pullRequest: PullRequestReference;
    readonly headSha: string;
    readonly attempt: number;
    readonly maximumAttempts: number;
    readonly state: RemediationState;
    readonly evidence: readonly PullRequestCheckEvidence[];
    readonly failureFingerprint?: string;
    readonly remediationRevision?: string;
    readonly blockers: readonly string[];
    readonly updatedAt: string;
}
export interface RemediationChangeSet {
    readonly summary: string;
    readonly files: readonly { path: string; content: string }[];
    readonly prepareDependencyLock?: boolean;
}
