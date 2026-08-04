import { CompiledPbosSystemArtifact } from "../../compiler-runtime";
import { DomainContract, KernelRuntime, KernelState } from "../../kernel";
import { DeploymentManifest } from "../contracts/deployment-manifest";
import { DomainRuntimeLoader } from "../domain/domain-runtime-loader";
import { ServiceRegistry } from "../services/service-registry";
import { BootSequence, BootStep } from "./boot-sequence";

export interface BootResult {
    readonly success: boolean;
    readonly kernelState: KernelState;
    readonly domains: readonly DomainContract[];
    readonly completedSteps: readonly BootStep[];
    readonly error?: string;
}

export class BootManager {
    constructor(
        private readonly kernel: KernelRuntime,
        private readonly services: ServiceRegistry
    ) {}

    async boot(artifact: CompiledPbosSystemArtifact, manifest: DeploymentManifest): Promise<BootResult> {
        const sequence = new BootSequence();
        try {
            const initialized = await this.kernel.initialize(artifact);
            if (initialized.lifecycleState !== "INITIALIZED") {
                throw new Error(initialized.failureReason ?? "Kernel initialization failed.");
            }
            sequence.complete("SYSTEM_IDENTITY");
            sequence.complete("KERNEL");
            sequence.complete("AUTHORITY_MODEL");
            sequence.complete("MISSION_CONTEXT");
            const domains = new DomainRuntimeLoader(this.kernel.getDomainRegistry()).load(manifest.domainIds);
            sequence.complete("DOMAIN_EXTENSIONS");
            this.services.validate(manifest.requiredServiceIds);
            sequence.complete("RUNTIME_SERVICES");
            const active = await this.kernel.activate();
            return { success: true, kernelState: active, domains, completedSteps: sequence.steps() };
        } catch (error) {
            const kernelState = this.kernel.getState().lifecycleState;
            if (kernelState === "INITIALIZED" || kernelState === "ACTIVE" || kernelState === "SUSPENDED") {
                await this.kernel.shutdown();
            }
            return {
                success: false,
                kernelState: this.kernel.getState(),
                domains: [],
                completedSteps: sequence.steps(),
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
