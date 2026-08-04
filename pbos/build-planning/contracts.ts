import { RepositoryInspection } from "../platform";
import { SystemBlueprint } from "../system-blueprint";
import { Mission, WorkPackage } from "../planner";

export interface CapabilityGap {
    readonly capability: string;
    readonly reason: string;
    readonly evidence: readonly string[];
    readonly priority: Mission["priority"];
}

export interface ImplementationStep {
    readonly order: number;
    readonly workPackageId: string;
    readonly title: string;
    readonly dependencies: readonly string[];
}

export interface GenesisBuildPlan {
    readonly planId: string;
    readonly blueprintId: string;
    readonly repositoryRevision: string;
    readonly blueprint: SystemBlueprint;
    readonly inspection: RepositoryInspection;
    readonly gaps: readonly CapabilityGap[];
    readonly missions: readonly Mission[];
    readonly workPackages: readonly WorkPackage[];
    readonly implementationPlan: readonly ImplementationStep[];
    readonly status: "READY_FOR_APPROVAL" | "BLOCKED";
    readonly blockers: readonly string[];
    readonly generatedAt: Date;
}
