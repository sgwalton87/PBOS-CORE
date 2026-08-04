export type ActionRisk = "LOW" | "MEDIUM" | "HIGH" | "IRREVERSIBLE";

export interface PlanAction {
    readonly actionId: string;
    readonly capability: string;
    readonly description: string;
    readonly dependencyIds: readonly string[];
    readonly risk: ActionRisk;
    readonly expectedOutcome: Readonly<Record<string, unknown>>;
}

export interface PlanModel {
    readonly planId: string;
    readonly missionId: string;
    readonly actions: readonly PlanAction[];
    readonly constraints: readonly string[];
    readonly estimatedOutcome: Readonly<Record<string, unknown>>;
    readonly status: "AWAITING_APPROVAL" | "APPROVED";
    readonly provenance: readonly string[];
    readonly createdAt: Date;
}
