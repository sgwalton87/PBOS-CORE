import { describe, expect, it } from "vitest";
import { CompiledPbosSystemArtifact } from "../../compiler-runtime";
import {
    AuthorizationEngine,
    DomainRegistry,
    IdentityRegistry,
    KernelRuntime,
    MissionRuntime,
    PermissionRegistry,
    WorkflowStateMachine
} from "../index";

function compiledSystem(options: { governed?: boolean; includeEvolution?: boolean } = {}): CompiledPbosSystemArtifact {
    const governed = options.governed ?? true;
    const includeEvolution = options.includeEvolution ?? true;
    const artifacts = [
        {
            id: "os-artifact-001",
            artifactType: "OPERATING_SYSTEM",
            operatingSystemModel: {
                id: "os-001",
                name: "Compiled Operating System",
                missions: [{
                    id: "mission-001",
                    name: "Primary Mission",
                    purpose: "Operate the compiled system",
                    objectives: ["Maintain governed operation"],
                    status: "DEFINED"
                }]
            }
        },
        {
            id: "execution-artifact-001",
            artifactType: "EXECUTION",
            executionModel: {
                id: "execution-001",
                actors: [{ id: "actor-001", roleId: "operator", status: "AVAILABLE" }],
                workflows: [{
                    id: "workflow-001",
                    steps: ["initialize", "operate"],
                    assignedActorIds: ["actor-001"],
                    status: "READY"
                }]
            }
        },
        ...(includeEvolution ? [{ id: "evolution-artifact-001", artifactType: "EVOLUTION" }] : []),
        {
            id: "governance-artifact-001",
            artifactType: "GOVERNANCE",
            governanceModel: {
                authorities: [{
                    id: "authority-001",
                    active: true,
                    permissions: ["OPERATE_SYSTEM"]
                }],
                decisions: [{
                    id: "decision-001",
                    authorityId: "authority-001",
                    status: governed ? "AUTHORIZED" : "DENIED"
                }]
            }
        }
    ];

    return {
        id: "compiled-system-001",
        artifactType: "COMPILED_PBOS_SYSTEM",
        schemaVersion: "1.0.0",
        targetSystemId: "PLAYBOOK-SYSTEM-001",
        sourceArtifact: {
            id: "system-artifact-001",
            artifactType: "SYSTEM",
            schemaVersion: "1.0.0",
            systemName: "The Playbook",
            repositoryPath: "/playbook",
            repositoryIdentity: "repository-001",
            commitHash: "commit-001",
            architecture: {
                applications: [], modules: [], domains: ["education"], frameworks: []
            },
            dependencies: [],
            capabilities: [],
            createdAt: new Date("2026-08-03T00:00:00.000Z"),
            metadata: {}
        },
        artifacts: artifacts as unknown as CompiledPbosSystemArtifact["artifacts"],
        governanceArtifact: artifacts[artifacts.length - 1] as unknown as CompiledPbosSystemArtifact["governanceArtifact"],
        lineage: [{
            stageId: "governance",
            stageOrder: 8,
            inputArtifactIds: ["evolution-artifact-001"],
            outputArtifactIds: ["governance-artifact-001"],
            lifecycleState: "VALIDATING",
            startedAt: new Date("2026-08-03T00:00:00.000Z"),
            completedAt: new Date("2026-08-03T00:00:01.000Z")
        }],
        compiledAt: new Date("2026-08-03T00:00:01.000Z")
    };
}

describe("PBOS v1 Kernel Foundation", () => {
    it("registers system and actor identities with domain and provenance", () => {
        const registry = new IdentityRegistry();
        registry.registerSystem({
            systemId: "system-001",
            systemName: "Domain OS",
            version: "1.0.0",
            lineage: ["artifact-001"],
            domainClassification: ["domain-a"]
        });
        registry.registerActor({
            actorId: "actor-001",
            systemId: "system-001",
            role: "operator",
            authorityContext: ["authority-001"],
            provenance: "execution-artifact-001",
            active: true
        });

        expect(registry.getSystem("system-001")?.domainClassification).toEqual(["domain-a"]);
        expect(registry.getActor("actor-001")?.provenance).toBe("execution-artifact-001");
    });

    it("fails closed for unknown authority and permits governed actions", () => {
        const permissions = new PermissionRegistry();
        const engine = new AuthorizationEngine(permissions);
        const actor = {
            actorId: "actor-001", systemId: "system-001", role: "operator",
            authorityContext: ["authority-001"], provenance: "execution-001", active: true
        };

        expect(engine.authorize(actor, "OPERATE_SYSTEM").allowed).toBe(false);
        permissions.register({
            authorityId: "authority-001",
            actorId: "actor-001",
            systemId: "system-001",
            allowedActions: ["OPERATE_SYSTEM"],
            governanceDecisionIds: ["decision-001"],
            active: true
        });
        expect(engine.authorize(actor, "OPERATE_SYSTEM").allowed).toBe(true);
        expect(engine.authorize(undefined, "OPERATE_SYSTEM").allowed).toBe(false);
    });

    it("enforces deterministic mission and workflow transitions", () => {
        const missions = new MissionRuntime();
        missions.register({
            missionId: "mission-001", systemId: "system-001", name: "Operate",
            purpose: "Operate safely", objectives: [], state: "CREATED", updatedAt: new Date()
        });
        expect(missions.transition("mission-001", "ACTIVE").state).toBe("ACTIVE");
        expect(() => missions.transition("mission-001", "CREATED")).toThrow("Invalid mission transition");

        const workflows = new WorkflowStateMachine();
        workflows.register({
            workflowId: "workflow-001", systemId: "system-001", steps: [], actorIds: [],
            state: "CREATED", updatedAt: new Date()
        });
        expect(workflows.transition("workflow-001", "READY").state).toBe("READY");
        expect(() => workflows.transition("workflow-001", "COMPLETED")).toThrow("Invalid workflow transition");
    });

    it("supports multiple domain extensions without domain-specific kernel logic", () => {
        const domains = new DomainRegistry();
        domains.register({
            domainId: "education", name: "Education", classification: "education",
            version: "1.0.0", systemIds: ["playbook"], metadata: {}
        });
        domains.register({
            domainId: "legacy", name: "Legacy", classification: "legacy",
            version: "1.0.0", systemIds: ["beneficiary"], metadata: {}
        });

        expect(domains.all().map(domain => domain.domainId)).toEqual(["education", "legacy"]);
        expect(domains.forSystem("beneficiary")[0].classification).toBe("legacy");
    });

    it("initializes and activates a governed compiled PBOS system", async () => {
        const kernel = new KernelRuntime();
        const initialized = await kernel.initialize(compiledSystem());

        expect(initialized.lifecycleState).toBe("INITIALIZED");
        expect(initialized.systemIdentity?.systemId).toBe("PLAYBOOK-SYSTEM-001");
        expect(initialized.integrations).toEqual({
            executionArtifactId: "execution-artifact-001",
            evolutionArtifactId: "evolution-artifact-001",
            governanceArtifactId: "governance-artifact-001"
        });
        expect(initialized.domainIds).toEqual(["PLAYBOOK-SYSTEM-001:education"]);

        await kernel.activate();
        expect(kernel.authorize("actor-001", "OPERATE_SYSTEM").allowed).toBe(true);
        await kernel.suspend();
        expect(kernel.authorize("actor-001", "OPERATE_SYSTEM").allowed).toBe(false);
        await kernel.shutdown();
        expect(kernel.getState().lifecycleState).toBe("SHUTDOWN");
    });

    it("fails safely for incomplete or unauthorized compiled systems", async () => {
        const missingIntegration = new KernelRuntime();
        expect((await missingIntegration.initialize(compiledSystem({ includeEvolution: false }))).lifecycleState).toBe("FAILED");

        const unauthorized = new KernelRuntime();
        const failed = await unauthorized.initialize(compiledSystem({ governed: false }));
        expect(failed.lifecycleState).toBe("FAILED");
        expect(failed.failureReason).toBe("Compiled system has no authorized governance decision.");
        await expect(unauthorized.activate()).rejects.toThrow("Invalid kernel transition");
    });
});
