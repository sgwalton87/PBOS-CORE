import { describe, expect, it } from "vitest";
import { CompiledPbosSystemArtifact } from "../../compiler-runtime";
import { KernelRuntime } from "../../kernel";
import {
    ArtifactDeployer, BootManager, BootSequence, DeploymentManager,
    HealthMonitor, RecoveryManager, RuntimeEnvironment, RuntimeLifecycle,
    ServiceRegistry
} from "../index";

function compiled(): CompiledPbosSystemArtifact {
    const artifacts = [
        { id: "os-artifact", artifactType: "OPERATING_SYSTEM", operatingSystemModel: { id: "os", name: "OS", missions: [] } },
        { id: "execution-artifact", artifactType: "EXECUTION", executionModel: {
            id: "execution", actors: [{ id: "actor", roleId: "operator", status: "AVAILABLE" }], workflows: []
        } },
        { id: "evolution-artifact", artifactType: "EVOLUTION" },
        { id: "governance-artifact", artifactType: "GOVERNANCE", governanceModel: {
            authorities: [{ id: "authority", active: true, permissions: ["OPERATE"] }],
            decisions: [{ id: "decision", authorityId: "authority", status: "AUTHORIZED" }]
        } }
    ];
    return {
        id: "compiled", artifactType: "COMPILED_PBOS_SYSTEM", schemaVersion: "1.0.0", targetSystemId: "system",
        sourceArtifact: {
            id: "source", artifactType: "SYSTEM", schemaVersion: "1.0.0", systemName: "System",
            repositoryPath: "/system", repositoryIdentity: "repository", commitHash: "commit",
            architecture: { applications: [], modules: [], domains: ["general"], frameworks: [] },
            dependencies: [], capabilities: [], createdAt: new Date(), metadata: {}
        },
        artifacts: artifacts as unknown as CompiledPbosSystemArtifact["artifacts"],
        governanceArtifact: artifacts[3] as unknown as CompiledPbosSystemArtifact["governanceArtifact"],
        lineage: [], compiledAt: new Date()
    };
}

const environment: RuntimeEnvironment = {
    environmentId: "validation", type: "VALIDATION", configuration: {}, createdAt: new Date()
};

describe("PBOS Runtime Deployment Architecture", () => {
    it("enforces runtime lifecycle transitions", () => {
        const lifecycle = new RuntimeLifecycle();
        expect(lifecycle.transition("INITIALIZED")).toBe("INITIALIZED");
        expect(lifecycle.transition("ACTIVE")).toBe("ACTIVE");
        expect(() => lifecycle.transition("CREATED")).toThrow("Invalid runtime transition");
    });

    it("enforces deterministic boot ordering", () => {
        const sequence = new BootSequence();
        expect(() => sequence.complete("KERNEL")).toThrow("Invalid boot step");
        for (const step of [
            "SYSTEM_IDENTITY", "KERNEL", "AUTHORITY_MODEL", "MISSION_CONTEXT", "DOMAIN_EXTENSIONS", "RUNTIME_SERVICES"
        ] as const) sequence.complete(step);
        expect(sequence.completeSuccessfully()).toBe(true);
    });

    it("validates service dependencies and required capabilities", () => {
        const services = new ServiceRegistry();
        expect(() => services.register({
            serviceId: "dependent", name: "Dependent", version: "1", capability: "dependent",
            dependencyIds: ["base"], active: true
        })).toThrow("Service dependencies unavailable");
        services.register({ serviceId: "base", name: "Base", version: "1", capability: "base", dependencyIds: [], active: true });
        services.validate(["base"]);
        expect(services.resolve("base")?.capability).toBe("base");
    });

    it("deploys and boots a compiled system into an active instance", async () => {
        const services = new ServiceRegistry();
        services.register({ serviceId: "core", name: "Core", version: "1", capability: "runtime", dependencyIds: [], active: true });
        const health = new HealthMonitor();
        const manager = new DeploymentManager(
            new ArtifactDeployer(), new BootManager(new KernelRuntime(), services), health
        );
        const deployment = await manager.deploy(compiled(), environment, ["core"]);

        expect(deployment.success).toBe(true);
        expect(deployment.instance.lifecycleState).toBe("ACTIVE");
        expect(deployment.instance.domainIds).toEqual(["system:general"]);
        expect(health.check(deployment.instance).healthy).toBe(true);
    });

    it("fails boot safely when a required service is unavailable", async () => {
        const manager = new DeploymentManager(
            new ArtifactDeployer(), new BootManager(new KernelRuntime(), new ServiceRegistry()), new HealthMonitor()
        );
        const deployment = await manager.deploy(compiled(), environment, ["missing"]);
        expect(deployment.success).toBe(false);
        expect(deployment.instance.lifecycleState).toBe("FAILED");
        expect(deployment.instance.kernelState.lifecycleState).toBe("SHUTDOWN");
    });

    it("recovers failed instances through an explicit recovery control", async () => {
        const health = new HealthMonitor();
        const failed = {
            instanceId: "instance", lifecycleState: "FAILED", updatedAt: new Date()
        } as unknown as Parameters<RecoveryManager["recover"]>[0];
        const result = await new RecoveryManager(health).recover(failed, async () => true);
        expect(result.recovered).toBe(true);
        expect(result.instance.lifecycleState).toBe("ACTIVE");
        expect(health.history("instance")[0].type).toBe("RECOVERY");
    });
});
