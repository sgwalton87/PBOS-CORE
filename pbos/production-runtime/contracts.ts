export const PRODUCTION_STATUSES = [
    "IDLE", "PLANNING", "AUTHORIZED", "QUEUED", "STARTING", "RUNNING", "VALIDATING", "REPAIRING",
    "GENERATING_PREVIEW", "AWAITING_APPROVAL", "PAUSED", "BLOCKED", "FAILED", "COMPLETED", "CERTIFIED",
    "CANCELLED", "RECOVERING"
] as const;

export type ProductionStatus = typeof PRODUCTION_STATUSES[number];
export type RuntimeHealth = "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";
export type StageType = "DISCOVERY" | "CONTEXT" | "SPECIFICATION" | "DEPENDENCY_GRAPH" | "MISSION" |
    "AUTHORIZATION" | "PLANNING" | "EXECUTION" | "COMMAND" | "TEST" | "BUILD" | "VALIDATION" | "REPAIR" |
    "PREVIEW" | "EVIDENCE" | "CERTIFICATION" | "COMMIT" | "CONTINUATION";

export const TERMINAL_PRODUCTION_STATUSES: readonly ProductionStatus[] = ["BLOCKED", "FAILED", "COMPLETED", "CERTIFIED", "CANCELLED"];

export interface ProductionStage {
    readonly stageId: string;
    readonly runId: string;
    readonly type: StageType;
    readonly title: string;
    readonly status: ProductionStatus;
    readonly startedAt: string;
    readonly lastHeartbeatAt: string;
    readonly completedAt?: string;
    readonly durationMs?: number;
    readonly attempt: number;
    readonly inputs: Readonly<Record<string, unknown>>;
    readonly outputs: Readonly<Record<string, unknown>>;
    readonly command?: string;
    readonly logs: readonly string[];
    readonly error?: string;
    readonly evidenceIds: readonly string[];
    readonly nextTransition?: ProductionStatus;
}

export interface ProductionRun {
    readonly runId: string;
    readonly runType: "AUTONOMOUS_BUILD" | "READINESS" | "RECOVERY";
    readonly triggerSource: "CLI" | "MISSION_CONTROL" | "RECOVERY" | "CONTINUATION";
    readonly actorId: string;
    readonly authorizationArtifactId: string;
    readonly parentRunId?: string;
    readonly repositoryContextId: string;
    readonly runtimeContextId: string;
    readonly systemId: string;
    readonly repository: string;
    readonly startingBranch: string;
    readonly startingCommit: string;
    readonly currentBranch: string;
    readonly currentCommit: string;
    readonly requestedObjective: string;
    readonly selectedMission: string;
    readonly selectionRationale: string;
    readonly dependencySnapshot: readonly string[];
    readonly status: ProductionStatus;
    readonly startedAt: string;
    readonly lastHeartbeatAt: string;
    readonly completedAt?: string;
    readonly durationMs?: number;
    readonly activeStageId?: string;
    readonly stageIds: readonly string[];
    readonly retryCount: number;
    readonly repairAttempts: number;
    readonly filesAdded: readonly string[];
    readonly filesModified: readonly string[];
    readonly filesDeleted: readonly string[];
    readonly commandsExecuted: readonly string[];
    readonly testsExecuted: readonly string[];
    readonly validationResults: readonly string[];
    readonly previewArtifactIds: readonly string[];
    readonly evidenceIds: readonly string[];
    readonly acceptanceEvidence: readonly ApplicationAcceptanceEvidence[];
    readonly certificationResult?: "GRANTED" | "WITHHELD";
    readonly blockers: readonly string[];
    readonly resumeCheckpoint?: string;
    readonly terminalSummary?: string;
    readonly nextMission?: string;
    readonly autonomousContinuation: boolean;
    readonly executionPlan?: ProductionExecutionPlan;
}

export interface ProductionExecutionPlan {
    readonly planId: string;
    readonly runId: string;
    readonly missionId: string;
    readonly objective: string;
    readonly governingSpecifications: readonly string[];
    readonly inScope: readonly string[];
    readonly outOfScope: readonly string[];
    readonly dependencies: readonly string[];
    readonly expectedFiles: readonly string[];
    readonly databaseChanges: readonly string[];
    readonly apiChanges: readonly string[];
    readonly uiChanges: readonly string[];
    readonly securityImplications: readonly string[];
    readonly dataImplications: readonly string[];
    readonly accessibilityImplications: readonly string[];
    readonly testPlan: readonly string[];
    readonly previewPlan: readonly string[];
    readonly recoveryPlan: readonly string[];
    readonly certificationCriteria: readonly string[];
    readonly expectedArtifacts: readonly string[];
    readonly approvalRequirements: readonly string[];
    readonly createdAt: string;
}

export interface ExecutionLease {
    readonly leaseId: string;
    readonly runId: string;
    readonly processId?: number;
    readonly host: string;
    readonly actorId: string;
    readonly acquiredAt: string;
    readonly lastRenewedAt: string;
    readonly expiresAt: string;
    readonly scope: string;
    readonly repository: string;
    readonly branch: string;
    readonly commit: string;
    readonly status: "ACTIVE" | "RELEASED" | "STALE";
    readonly releaseMethod?: "COMPLETED" | "CANCELLED" | "RECOVERED" | "PAUSED" | "AWAITING_APPROVAL";
    readonly recoveryMetadata?: Readonly<Record<string, unknown>>;
}

export interface ProductionEvent {
    readonly eventId: string;
    readonly sequence: number;
    readonly type: string;
    readonly timestamp: string;
    readonly runId: string;
    readonly parentEntityId: string;
    readonly actorId: string;
    readonly severity: "DEBUG" | "INFO" | "WARN" | "ERROR";
    readonly status: ProductionStatus;
    readonly summary: string;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly repository: string;
    readonly branch: string;
    readonly commit: string;
    readonly correlationId: string;
    readonly traceId?: string;
}

export interface MissionQueueItem {
    readonly missionId: string;
    readonly systemId: string;
    readonly title: string;
    readonly dependencies: readonly string[];
    readonly status: "QUEUED" | "ELIGIBLE" | "ACTIVE" | "COMPLETE" | "BLOCKED";
    readonly rationale: string;
    readonly approvalRequired: boolean;
    readonly evidenceIds: readonly string[];
    readonly completionPolicy?: MissionCompletionPolicy;
}

export type ApplicationAcceptanceDimension = "ROUTE" | "USER_INTERFACE" | "DURABLE_DATA" | "AUTHORITY" |
    "PBOS_INTEGRATION" | "ACCEPTANCE_TEST" | "ACCESSIBILITY" | "SECURITY" | "INDEPENDENT_VALIDATION" | "PREVIEW";

export interface ApplicationAcceptanceEvidence {
    readonly evidenceId: string;
    readonly dimension: ApplicationAcceptanceDimension;
    readonly behavior: string;
    readonly repository: string;
    readonly commit: string;
    readonly artifact: string;
    readonly passed: boolean;
    readonly source: "IMPLEMENTATION" | "APPLICATION_TEST" | "RUNTIME_PROBE" | "ACCESSIBILITY_AUDIT" |
        "SECURITY_TEST" | "CI_VALIDATION" | "PREVIEW_PROBE";
}

export interface MissionCompletionPolicy {
    readonly kind: "PLATFORM_ARTIFACT" | "FUNCTIONAL_APPLICATION";
    readonly requiredDimensions: readonly ApplicationAcceptanceDimension[];
    readonly acceptanceCriteria: readonly string[];
}

export interface PreviewManifest {
    readonly previewId: string;
    readonly runId: string;
    readonly repository: string;
    readonly branch: string;
    readonly commit: string;
    readonly status: "REQUESTED" | "READY" | "FAILED" | "NOT_APPLICABLE";
    /** @deprecated Use webUrl for application delivery evidence. */
    readonly url?: string;
    readonly webUrl?: string;
    readonly mobileUrl?: string;
    readonly routes: readonly string[];
    readonly personas: readonly string[];
    readonly viewports: readonly string[];
    readonly screenshots: readonly string[];
    readonly generatedAt: string;
    readonly label: "LIVE" | "SEEDED" | "SIMULATED" | "NONVISUAL";
}

export interface RuntimeHealthReport {
    readonly health: RuntimeHealth;
    readonly checkedAt: string;
    readonly components: readonly { readonly component: string; readonly health: RuntimeHealth; readonly detail: string }[];
}

export interface RuntimeMetrics {
    readonly runsStarted: number;
    readonly runsCompleted: number;
    readonly runsFailed: number;
    readonly runsBlocked: number;
    readonly runsRecovered: number;
    readonly totalDurationMs: number;
    readonly medianDurationMs: number;
    readonly repairAttempts: number;
    readonly certificationRate: number;
    readonly queueDepth: number;
    readonly activeRunCount: number;
    readonly staleLeaseCount: number;
}

export interface MissionControlSnapshot {
    readonly connection: "CONNECTED" | "DISCONNECTED" | "UNKNOWN";
    readonly status: ProductionStatus;
    readonly activeRun?: ProductionRun;
    readonly activeStage?: ProductionStage;
    readonly activeLease?: ExecutionLease;
    readonly lastRun?: ProductionRun;
    readonly history: readonly ProductionRun[];
    readonly latestPreview?: PreviewManifest;
    readonly nextMission?: MissionQueueItem;
    readonly recentEvents: readonly ProductionEvent[];
    readonly health: RuntimeHealthReport;
    readonly metrics: RuntimeMetrics;
    readonly generatedAt: string;
    readonly sourceVersion: "PBOS-PRODUCTION-RUNTIME-1";
}
