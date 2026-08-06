export const DISTRIBUTED_PLATFORM_NODE_IDS = [
    "CONSTITUTION", "SOURCE_CONTROL", "BUILD_OS", "DATA_PLATFORM", "CLOUD_IDENTITY", "DEPLOYMENT",
    "DOMAIN_DNS", "EMAIL", "SECRETS", "OBSERVABILITY", "AI_PROVIDERS", "EXTERNAL_SERVICES", "CLIENT", "PRODUCT"
] as const;

export type DistributedPlatformNodeId = typeof DISTRIBUTED_PLATFORM_NODE_IDS[number];
export type PlatformValidationScope = "FUNCTIONAL_ACCEPTANCE" | "PRODUCTION_RELEASE" | "CONTINUOUS";
export type PlatformHealth = "HEALTHY" | "DEGRADED" | "FAILED" | "BLOCKED" | "UNKNOWN";

export interface DistributedPlatformDependency {
    readonly nodeId: DistributedPlatformNodeId;
    readonly scopes: readonly PlatformValidationScope[];
}

export interface DistributedPlatformNode {
    readonly nodeId: DistributedPlatformNodeId;
    readonly layer: string;
    readonly canonicalPlatforms: readonly string[];
    readonly responsibility: string;
    readonly validates: readonly string[];
    readonly dependencies: readonly DistributedPlatformDependency[];
    readonly requiredFor: readonly PlatformValidationScope[];
}

export interface PlatformValidationEvidence {
    readonly nodeId: DistributedPlatformNodeId;
    readonly health: PlatformHealth;
    readonly checkedAt: string;
    readonly source: string;
    readonly detail: string;
    readonly artifact?: string;
}

export interface DistributedPlatformNodeResult {
    readonly node: DistributedPlatformNode;
    readonly health: PlatformHealth;
    readonly evidence?: PlatformValidationEvidence;
    readonly blockers: readonly string[];
}

export interface DistributedPlatformReport {
    readonly scope: PlatformValidationScope;
    readonly health: PlatformHealth;
    readonly generatedAt: string;
    readonly order: readonly DistributedPlatformNodeId[];
    readonly nodes: readonly DistributedPlatformNodeResult[];
    readonly blockers: readonly string[];
}
