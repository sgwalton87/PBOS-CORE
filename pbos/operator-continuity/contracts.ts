import type { RemediationState } from "../validation-automation/contracts";

export interface OperatorMemoRecord {
    readonly memoId: string;
    readonly systemId: string;
    readonly sessionId: string;
    readonly runId?: string;
    readonly state: RemediationState | "SESSION_ACTIVE";
    readonly path: string;
    readonly createdAt: string;
}

export interface BackgroundMonitorJob {
    readonly jobId: string;
    readonly systemId: string;
    readonly sessionId: string;
    readonly runId: string;
    readonly pid: number;
    readonly logPath: string;
    readonly status: "RUNNING" | "COMPLETED" | "BLOCKED";
    readonly startedAt: string;
    readonly updatedAt: string;
}

export type AutonomousBatchState = "PLANNED" | "VALIDATING" | "REMEDIATING" | "READY_FOR_CERTIFICATION" | "BLOCKED";

export interface AutonomousBuildBatch {
    readonly batchId: string;
    readonly systemId: string;
    readonly sessionId: string;
    readonly planId: string;
    readonly packageLimit: number;
    readonly workPackages: readonly { readonly workPackageId: string; readonly title: string }[];
    readonly branch: string;
    readonly pullRequestUrl: string;
    readonly runId: string;
    readonly state: AutonomousBatchState;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export type BatchTelemetryType = "BATCH_STARTED" | "WORK_PACKAGE_QUEUED" | "WORK_PACKAGE_STARTED" |
    "WORK_PACKAGE_COMPLETED" | "SECTION_COMPLETED" | "VALIDATION_STARTED" | "REMEDIATION_STARTED" |
    "BATCH_READY_FOR_APPROVAL" | "BATCH_BLOCKED";

export interface BatchTelemetryEvent {
    readonly eventId: string;
    readonly batchId: string;
    readonly systemId: string;
    readonly sessionId: string;
    readonly type: BatchTelemetryType;
    readonly workPackageId?: string;
    readonly title: string;
    readonly detail: string;
    readonly occurredAt: string;
}

export interface BatchTelemetryReporter {
    beginBatch(systemId: string, sessionId: string, workPackages: readonly { readonly id: string; readonly title: string }[],
        context?: Readonly<{ repository: string; branch: string; commit: string; objective: string; mission: string }>): string;
    packageStarted(batchId: string, systemId: string, sessionId: string, workPackageId: string, title: string): void;
    packageCompleted(batchId: string, systemId: string, sessionId: string, workPackageId: string, title: string): void;
}

export type ProgressStage = "INSPECTING" | "PLANNING" | "BUILDING" | "PUSHING" | "VALIDATING" | "REMEDIATING" | "WAITING" | "READY";
export type ProgressReporter = (stage: ProgressStage, message: string) => void;
