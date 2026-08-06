export const PRODUCTION_STATUSES = [
    "IDLE", "PLANNING", "AUTHORIZED", "QUEUED", "STARTING", "RUNNING", "VALIDATING", "REPAIRING",
    "GENERATING_PREVIEW", "AWAITING_APPROVAL", "PAUSED", "BLOCKED", "FAILED", "COMPLETED", "CERTIFIED",
    "CANCELLED", "RECOVERING"
] as const;

export type ProductionStatus = typeof PRODUCTION_STATUSES[number];
export type RuntimeHealth = "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";
export type StageType = "DISCOVERY" | "CONTEXT" | "SPECIFICATION" | "DEPENDENCY_GRAPH" | "MISSION" |
    "AUTHORIZATION" | "PLANNING" | "EXECUTION" | "COMMAND" | "TEST" | "BUILD" | "VALIDATION" | "REPAIR" |
    "PREREQUISITE" | "APPLICATION_LAUNCH" | "RUNTIME_VERIFICATION" | "BROWSER_JOURNEY" | "NATIVE_JOURNEY" | "ACCEPTANCE" |
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
    readonly repairAttemptLimit?: number;
    readonly repairExtensionApprovalIds?: readonly string[];
    readonly recoveryEpochIds?: readonly string[];
    readonly activeRecoveryEpochId?: string;
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
    readonly functionalAcceptancePlan?: FunctionalAcceptancePlan;
}

export type ProductionRecoveryEpochStatus = "AWAITING_AUTHORIZATION" | "AUTHORIZED" | "ACTIVE" | "EXHAUSTED" | "COMPLETED";

export interface RecoveryRepairRecord {
    readonly attempt: number;
    readonly classification: string;
    readonly startedAt: string;
    readonly startedEventId: string;
    readonly outcome: "SUCCEEDED" | "FAILED" | "UNKNOWN";
    readonly outcomeAt?: string;
    readonly outcomeEventId?: string;
}

export interface ProductionRecoveryEpoch {
    readonly recoveryEpochId: string;
    readonly epochNumber: number;
    readonly runId: string;
    readonly systemId: string;
    readonly missionId: string;
    readonly missionTitle: string;
    readonly status: ProductionRecoveryEpochStatus;
    readonly reasonBudgetExhausted: string;
    readonly attemptedRepairs: readonly RecoveryRepairRecord[];
    readonly repositoryState: Readonly<{
        repository: string;
        branch: string;
        commit: string;
        remediationRunIds: readonly string[];
    }>;
    readonly runtimeState: Readonly<{
        status: ProductionStatus;
        activeStageId?: string;
        lastHeartbeatAt: string;
        repairAttempts: number;
        repairAttemptLimit: number;
        stageStatuses: readonly Readonly<{ stageId: string; type: StageType; status: ProductionStatus; error?: string }>[];
    }>;
    readonly remainingDefects: readonly string[];
    readonly lineageEvidenceIds: readonly string[];
    readonly previousRecoveryEpochId?: string;
    readonly requestedAt: string;
    readonly requestedBy: string;
    readonly authorizationApprovalId?: string;
    readonly authorizedAt?: string;
    readonly additionalAttempts?: number;
    readonly completedAt?: string;
    readonly completionReason?: string;
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
    readonly executionBlocker?: string;
    readonly blockedRunId?: string;
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
    readonly source: "IMPLEMENTATION" | "APPLICATION_TEST" | "RUNTIME_PROBE" | "BROWSER_JOURNEY" |
        "NATIVE_JOURNEY" | "ACCESSIBILITY_AUDIT" | "SECURITY_TEST" | "CI_VALIDATION" | "PREVIEW_PROBE";
}

export interface FunctionalRuntimeCommand {
    readonly command: string;
    readonly args: readonly string[];
    readonly requiredEnvironmentVariables?: readonly string[];
    readonly publicEnvironment?: Readonly<Record<string, string>>;
    readonly timeoutMs?: number;
}

export interface ProtectedEnvironmentFile {
    /** Absolute path to a non-versioned dotenv file. Secret values are never copied into PBOS state. */
    readonly path: string;
    readonly required?: boolean;
}

export interface FunctionalRuntimeProbe {
    readonly probeId: string;
    readonly dimension: Extract<ApplicationAcceptanceDimension,
        "ROUTE" | "DURABLE_DATA" | "AUTHORITY" | "PBOS_INTEGRATION" | "SECURITY">;
    readonly behavior: string;
    readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    readonly path: string;
    readonly expectedStatus: number;
    readonly requestBody?: unknown;
    readonly responseIncludes?: string;
}

export interface BrowserJourneyPlan {
    readonly journeyId: string;
    readonly persona: string;
    readonly behavior: string;
    readonly route: string;
    readonly engine: "PLAYWRIGHT" | "WEBDRIVER" | "CYPRESS";
    readonly command: FunctionalRuntimeCommand;
    readonly viewports: readonly ("DESKTOP_1440X900" | "MOBILE_390X844")[];
    readonly screenshotArtifacts: readonly string[];
    readonly traceArtifact: string;
    readonly accessibilityArtifact: string;
    readonly acceptanceArtifact: string;
    readonly visualCanon?: Readonly<{
        readonly screenId: string;
        readonly manifestPath: string;
        readonly requiredRoute: string;
        readonly requiredAssets: readonly string[];
    }>;
    readonly verifiedDimensions: readonly Extract<ApplicationAcceptanceDimension,
        "ROUTE" | "DURABLE_DATA" | "AUTHORITY" | "PBOS_INTEGRATION" | "SECURITY">[];
}

export interface NativeJourneyPlan {
    readonly journeyId: string;
    readonly behavior: string;
    readonly platforms: readonly ("IOS" | "ANDROID")[];
    readonly command: FunctionalRuntimeCommand;
    readonly artifacts: readonly string[];
    readonly acceptanceArtifact: string;
    readonly verifiedDimensions: readonly Extract<ApplicationAcceptanceDimension,
        "ROUTE" | "USER_INTERFACE" | "DURABLE_DATA" | "AUTHORITY" | "PBOS_INTEGRATION" |
        "ACCEPTANCE_TEST" | "ACCESSIBILITY" | "SECURITY">[];
}

export interface FunctionalAcceptancePlan {
    readonly planId: string;
    readonly systemId: string;
    readonly productNodeId: string;
    readonly journeyId: string;
    readonly repository: string;
    readonly branch: string;
    readonly commit: string;
    readonly workingDirectory: string;
    readonly protectedEnvironmentFiles?: readonly ProtectedEnvironmentFile[];
    readonly prerequisites?: readonly FunctionalRuntimeCommand[];
    readonly minimumFreeBytes?: number;
    readonly launch: FunctionalRuntimeCommand & Readonly<{
        baseUrl: string;
        healthPath: string;
        startupTimeoutMs: number;
    }>;
    readonly probes: readonly FunctionalRuntimeProbe[];
    readonly browserJourneys: readonly BrowserJourneyPlan[];
    readonly nativeJourneys?: readonly NativeJourneyPlan[];
    /** Protected provider action prepared by an adapter and executed only after exact-revision CI passes. */
    readonly previewDeployment?: PreviewDeploymentRequest;
    /**
     * Durable preview endpoints are separate from the temporary verification
     * process. They are optional for journey missions and required by any
     * completion policy that includes PREVIEW.
     */
    readonly durablePreview?: Readonly<{
        webUrl: string;
        mobileUrl: string;
        iosUrl?: string;
        androidUrl?: string;
        healthPath: string;
        /** A provider install page is probed at its existing path, not the web application's health route. */
        mobileHealthPath?: string;
        providerEvidence?: Readonly<Record<string, string>>;
        label: "LIVE" | "SEEDED";
    }>;
}

interface PreviewDeploymentRequestBase {
    readonly repository: string;
    readonly branch: string;
    readonly commit: string;
    readonly environment: "preview";
    readonly approvalId: string;
    readonly browserTarget: "DEPLOYED_PREVIEW";
}

export interface VercelPreviewDeploymentRequest extends PreviewDeploymentRequestBase {
    readonly provider: "VERCEL";
    readonly tokenEnvironmentVariable: "VERCEL_TOKEN";
    readonly projectEnvironmentVariable: "VERCEL_PROJECT_ID";
    readonly teamEnvironmentVariable?: "VERCEL_TEAM_ID";
    readonly requiredProjectEnvironmentVariables: readonly string[];
    readonly previewOnlyEnvironmentVariables: readonly string[];
}

export interface EasPreviewDeploymentRequest extends PreviewDeploymentRequestBase {
    readonly provider: "EAS";
    readonly tokenEnvironmentVariable: "EXPO_TOKEN";
    readonly projectEnvironmentVariable: "EXPO_PROJECT_ID";
    readonly webPreviewEnvironmentVariable: "PBOS_WEB_PREVIEW_URL";
    readonly applicationDirectory: "apps/mobile";
    readonly cliVersion: string;
    readonly previewProfile: "preview";
    readonly storeProfile: "production";
    readonly submitProfile: "production";
    readonly platforms: readonly ["IOS", "ANDROID"];
    readonly distributionTarget: "TESTFLIGHT_AND_PLAY_INTERNAL";
}

export type PreviewDeploymentRequest = VercelPreviewDeploymentRequest | EasPreviewDeploymentRequest;

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
