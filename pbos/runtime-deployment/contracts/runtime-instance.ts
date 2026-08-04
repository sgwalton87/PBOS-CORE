import { KernelState } from "../../kernel";
import { DeploymentManifest } from "./deployment-manifest";
import { RuntimeEnvironment } from "./runtime-environment";
import { RuntimeLifecycleState } from "../lifecycle/runtime-lifecycle";

export interface RuntimeInstance {
    readonly instanceId: string;
    readonly systemId: string;
    readonly kernelId: string;
    readonly kernelState: KernelState;
    readonly domainIds: readonly string[];
    readonly lifecycleState: RuntimeLifecycleState;
    readonly environment: RuntimeEnvironment;
    readonly manifest: DeploymentManifest;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly metadata: Readonly<Record<string, unknown>>;
}
