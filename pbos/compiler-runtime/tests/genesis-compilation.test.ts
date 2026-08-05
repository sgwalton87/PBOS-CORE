import { describe, expect, it } from "vitest";
import {
    RegisteredSystem,
    SystemArtifact,
    SystemRegistry
} from "../../acquisition-engine";
import {
    CompilationOrchestrator,
    CompilationStage,
    GenesisCompiler
} from "../index";

function createTarget(): RegisteredSystem {
    const artifact: SystemArtifact = {
        id: "system-artifact-001",
        artifactType: "SYSTEM",
        schemaVersion: "1.0.0",
        systemName: "The Playbook",
        repositoryPath: "/playbook",
        repositoryIdentity: "playbook-repository",
        commitHash: "commit-001",
        architecture: {
            applications: ["app"],
            modules: ["components"],
            domains: ["playbook"],
            frameworks: ["typescript"]
        },
        dependencies: [],
        capabilities: ["playbook compilation"],
        createdAt: new Date("2026-08-03T00:00:00.000Z"),
        metadata: { playbookSystemId: "PLAYBOOK-SYSTEM-001" }
    };

    return {
        id: "registered-system-001",
        systemId: "PLAYBOOK-SYSTEM-001",
        systemName: "The Playbook",
        artifact,
        lifecycleState: "REGISTERED",
        registeredAt: new Date("2026-08-03T00:00:00.000Z"),
        metadata: { source: "genesis-compilation.test" }
    };
}

describe("PBOS Genesis Compilation Pipeline", () => {
    it("loads and compiles the registered Playbook target", () => {
        const registry = new SystemRegistry();
        registry.register(createTarget());

        const result = new GenesisCompiler(registry).compile("PLAYBOOK-SYSTEM-001");

        expect(result.success).toBe(true);
        expect(result.job.targetSystemId).toBe("PLAYBOOK-SYSTEM-001");
        expect(result.job.lifecycleState).toBe("CERTIFIED");
        expect(result.compiledArtifact?.artifactType).toBe("COMPILED_PBOS_SYSTEM");
        expect(result.compiledArtifact?.governanceArtifact.artifactType).toBe("GOVERNANCE");
    });

    it("executes every stage in deterministic order and preserves artifact flow", () => {
        const result = new CompilationOrchestrator().compile(createTarget());

        expect(result.job.lineage.map(record => record.stageId)).toEqual([
            "acquisition",
            "evidence",
            "knowledge",
            "organization",
            "operating-system",
            "execution",
            "evolution",
            "governance"
        ]);
        expect(result.job.outputArtifacts.map(artifact => artifact.artifactType)).toEqual([
            "SYSTEM",
            "EVIDENCE",
            "KNOWLEDGE_GRAPH",
            "ORGANIZATION",
            "OPERATING_SYSTEM",
            "EXECUTION",
            "EVOLUTION",
            "GOVERNANCE"
        ]);
        expect(result.job.lineage.every(record => record.outputArtifactIds.length > 0)).toBe(true);
    });

    it("records explainable lifecycle transitions", () => {
        const result = new CompilationOrchestrator().compile(createTarget());

        expect(result.job.stateTransitions.map(transition => transition.to)).toEqual([
            "INITIALIZED",
            "ACQUIRING",
            "ANALYZING",
            "ANALYZING",
            "COMPILING",
            "COMPILING",
            "COMPILING",
            "COMPILING",
            "VALIDATING",
            "CERTIFIED"
        ]);
        expect(result.job.errors).toEqual([]);
    });

    it("fails safely and stops when a stage reports an error", () => {
        const acquisition: CompilationStage = {
            id: "acquisition",
            order: 1,
            requiredInputs: ["REGISTERED_SYSTEM"],
            producedOutputs: ["SYSTEM"],
            lifecycleState: "ACQUIRING",
            execute: context => ({ artifacts: [context.artifacts[0]] })
        };
        const failing: CompilationStage = {
            id: "evidence",
            order: 2,
            requiredInputs: ["SYSTEM"],
            producedOutputs: ["EVIDENCE"],
            lifecycleState: "ANALYZING",
            execute: () => { throw new Error("controlled stage failure"); }
        };

        const result = new CompilationOrchestrator([failing, acquisition]).compile(createTarget());

        expect(result.success).toBe(false);
        expect(result.job.lifecycleState).toBe("FAILED");
        expect(result.job.lineage.map(record => record.stageId)).toEqual(["acquisition"]);
        expect(result.job.errors).toEqual([
            expect.objectContaining({
                stageId: "evidence",
                message: "controlled stage failure"
            })
        ]);
    });

    it("rejects ambiguous stage identities and execution orders", () => {
        const stage: CompilationStage = {
            id: "duplicate",
            order: 1,
            requiredInputs: [],
            producedOutputs: [],
            lifecycleState: "COMPILING",
            execute: () => ({ artifacts: [] })
        };

        expect(() => new CompilationOrchestrator([stage, stage])).toThrow(
            "Compilation stages require unique identities and execution orders."
        );
    });
});
