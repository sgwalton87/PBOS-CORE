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

export type ProgressStage = "INSPECTING" | "PLANNING" | "BUILDING" | "PUSHING" | "VALIDATING" | "REMEDIATING" | "WAITING" | "READY";
export type ProgressReporter = (stage: ProgressStage, message: string) => void;
