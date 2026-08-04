import { randomUUID } from "crypto";
import { CompiledPbosSystemArtifact } from "../../compiler-runtime";
import { RuntimeInstance } from "../contracts/runtime-instance";
import { RuntimeEnvironment } from "../contracts/runtime-environment";
import { BootManager } from "../boot/boot-manager";
import { HealthMonitor } from "../observability/health-monitor";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import { ArtifactDeployer } from "./artifact-deployer";

export interface DeploymentRecord {
    readonly deploymentId: string;
    readonly compiledArtifactId: string;
    readonly instance: RuntimeInstance;
    readonly success: boolean;
    readonly lineage: readonly string[];
    readonly error?: string;
}

export class DeploymentManager {
    constructor(
        private readonly artifacts: ArtifactDeployer,
        private readonly boot: BootManager,
        private readonly health: HealthMonitor
    ) {}

    async deploy(
        artifact: CompiledPbosSystemArtifact,
        environment: RuntimeEnvironment,
        requiredServiceIds: readonly string[] = []
    ): Promise<DeploymentRecord> {
        const deploymentId = randomUUID();
        const instanceId = randomUUID();
        const manifest = this.artifacts.prepare(artifact, environment, requiredServiceIds);
        const lifecycle = new RuntimeLifecycle();
        const boot = await this.boot.boot(artifact, manifest);
        const now = new Date();
        lifecycle.transition(boot.success ? "INITIALIZED" : "FAILED");
        if (boot.success) lifecycle.transition("ACTIVE");
        const instance: RuntimeInstance = {
            instanceId,
            systemId: artifact.targetSystemId,
            kernelId: boot.kernelState.kernelId,
            kernelState: boot.kernelState,
            domainIds: boot.domains.map(domain => domain.domainId),
            lifecycleState: lifecycle.current(),
            environment,
            manifest,
            createdAt: now,
            updatedAt: now,
            metadata: { deploymentId }
        };
        this.health.record(instanceId, "LIFECYCLE", boot.success ? "runtime.active" : "runtime.failed", {
            deploymentId,
            error: boot.error
        });
        return {
            deploymentId,
            compiledArtifactId: artifact.id,
            instance,
            success: boot.success,
            lineage: manifest.lineage,
            error: boot.error
        };
    }
}
