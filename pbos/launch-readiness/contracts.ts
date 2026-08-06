export type LaunchCip = "CIP-046" | "CIP-047" | "CIP-048" | "CIP-049" | "CIP-050";
export type LaunchGate = "AUTOMATED" | "HUMAN_VALIDATION" | "HUMAN_APPROVAL" | "EXTERNAL_ACCOUNT";
export type LaunchTaskState = "READY" | "BLOCKED" | "COMPLETE";

export interface LaunchEvidence {
    readonly evidenceId: string;
    readonly taskId: string;
    readonly valid: boolean;
    readonly evidenceType: "PLATFORM_ARTIFACT" | "FUNCTIONAL_ACCEPTANCE" | "HUMAN_APPROVAL" | "EXTERNAL_PROOF";
    readonly repository: string;
    readonly commit: string;
    readonly artifact: string;
    readonly acceptanceCriteria: readonly string[];
    readonly approvalId?: string;
}

export interface LaunchTaskDefinition {
    readonly taskId: string;
    readonly cip: LaunchCip;
    readonly title: string;
    readonly dependencies: readonly string[];
    readonly acceptanceCriteria: readonly string[];
    readonly gate: LaunchGate;
}

export interface LaunchTask extends LaunchTaskDefinition {
    readonly state: LaunchTaskState;
    readonly evidenceIds: readonly string[];
    readonly blockedBy: readonly string[];
}

export interface LaunchReadinessPlan {
    readonly systemId: "PLAYBOOK-SYSTEM-001";
    readonly tasks: readonly LaunchTask[];
    readonly nextTask?: LaunchTask;
    readonly readyForPublicLaunch: boolean;
}
