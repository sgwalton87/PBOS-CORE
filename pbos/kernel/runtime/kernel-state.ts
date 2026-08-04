import { ActorIdentity } from "../identity/actor-identity";
import { SystemIdentity } from "../identity/system-identity";
import { KernelMission } from "../mission/mission-contract";
import { KernelWorkflow } from "../workflow/workflow-contract";

export type KernelLifecycleState =
    | "CREATED"
    | "INITIALIZED"
    | "ACTIVE"
    | "SUSPENDED"
    | "SHUTDOWN"
    | "FAILED";

export interface KernelIntegrationContext {
    readonly executionArtifactId: string;
    readonly evolutionArtifactId: string;
    readonly governanceArtifactId: string;
}

export interface KernelState {
    readonly kernelId: string;
    readonly lifecycleState: KernelLifecycleState;
    readonly systemIdentity?: SystemIdentity;
    readonly actors: readonly ActorIdentity[];
    readonly domainIds: readonly string[];
    readonly missions: readonly KernelMission[];
    readonly workflows: readonly KernelWorkflow[];
    readonly integrations?: KernelIntegrationContext;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly failureReason?: string;
}
