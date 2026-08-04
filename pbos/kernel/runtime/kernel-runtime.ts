import { randomUUID } from "crypto";
import {
    EvolutionArtifact,
    ExecutionArtifact,
    GovernanceArtifact,
    OperatingSystemArtifact
} from "../../compiler-artifacts";
import { CompiledPbosSystemArtifact } from "../../compiler-runtime";
import { AuthorizationDecision } from "../authority/authority-contract";
import { AuthorizationEngine } from "../authority/authorization-engine";
import { PermissionRegistry } from "../authority/permission-registry";
import { IdentityRegistry } from "../identity/identity-registry";
import { DomainRegistry } from "../domain/domain-registry";
import { MissionRuntime } from "../mission/mission-runtime";
import { KernelStorageContract } from "../storage/storage-contract";
import { WorkflowStateMachine } from "../workflow/workflow-state-machine";
import { KernelLifecycleState, KernelState } from "./kernel-state";

const LIFECYCLE_TRANSITIONS: Readonly<Record<KernelLifecycleState, readonly KernelLifecycleState[]>> = {
    CREATED: ["INITIALIZED", "FAILED"],
    INITIALIZED: ["ACTIVE", "SHUTDOWN", "FAILED"],
    ACTIVE: ["SUSPENDED", "SHUTDOWN", "FAILED"],
    SUSPENDED: ["ACTIVE", "SHUTDOWN", "FAILED"],
    SHUTDOWN: [],
    FAILED: ["SHUTDOWN"]
};

export class KernelRuntime {
    private state: KernelState;
    private systemId?: string;
    private readonly authorization: AuthorizationEngine;

    constructor(
        private readonly identities = new IdentityRegistry(),
        private readonly permissions = new PermissionRegistry(),
        private readonly missions = new MissionRuntime(),
        private readonly workflows = new WorkflowStateMachine(),
        private readonly domains = new DomainRegistry(),
        private readonly storage?: KernelStorageContract
    ) {
        const now = new Date();
        this.state = {
            kernelId: randomUUID(),
            lifecycleState: "CREATED",
            actors: [],
            domainIds: [],
            missions: [],
            workflows: [],
            createdAt: now,
            updatedAt: now
        };
        this.authorization = new AuthorizationEngine(this.permissions);
    }

    async initialize(compiled: CompiledPbosSystemArtifact): Promise<KernelState> {
        this.requireState("CREATED");
        this.systemId = compiled.targetSystemId;
        try {
            const execution = this.artifact<ExecutionArtifact>(compiled, "EXECUTION");
            const evolution = this.artifact<EvolutionArtifact>(compiled, "EVOLUTION");
            const governance = compiled.governanceArtifact;
            const operatingSystem = this.artifact<OperatingSystemArtifact>(compiled, "OPERATING_SYSTEM");
            this.assertGoverned(governance);

            const systemIdentity = {
                systemId: compiled.targetSystemId,
                systemName: compiled.sourceArtifact.systemName,
                version: compiled.schemaVersion,
                lineage: compiled.lineage.flatMap(record => record.outputArtifactIds),
                domainClassification: compiled.sourceArtifact.architecture.domains
            };
            this.identities.registerSystem(systemIdentity);
            for (const classification of new Set(systemIdentity.domainClassification)) {
                this.domains.register({
                    domainId: `${compiled.targetSystemId}:${classification}`,
                    name: classification,
                    classification,
                    version: compiled.schemaVersion,
                    systemIds: [compiled.targetSystemId],
                    metadata: { source: "CompiledPbosSystemArtifact" }
                });
            }
            const activeAuthorityIds = governance.governanceModel.authorities
                .filter(authority => authority.active)
                .map(authority => authority.id);

            for (const runtimeActor of execution.executionModel.actors) {
                const governedAuthorityIds = governance.governanceModel.authorities
                    .filter(authority => authority.active)
                    .map(authority => `${authority.id}:${runtimeActor.id}`);
                const actor = {
                    actorId: runtimeActor.id,
                    systemId: compiled.targetSystemId,
                    role: runtimeActor.roleId,
                    authorityContext: [...activeAuthorityIds, ...governedAuthorityIds],
                    provenance: execution.id,
                    active: runtimeActor.status !== "OFFLINE"
                };
                this.identities.registerActor(actor);
                for (const authority of governance.governanceModel.authorities.filter(candidate => candidate.active)) {
                    const decisions = governance.governanceModel.decisions
                        .filter(decision => decision.authorityId === authority.id && decision.status === "AUTHORIZED")
                        .map(decision => decision.id);
                    this.permissions.register({
                        authorityId: `${authority.id}:${actor.actorId}`,
                        actorId: actor.actorId,
                        systemId: compiled.targetSystemId,
                        allowedActions: authority.permissions,
                        governanceDecisionIds: decisions,
                        active: decisions.length > 0
                    });
                }
            }

            for (const mission of operatingSystem.operatingSystemModel.missions) {
                this.missions.register({
                    missionId: mission.id,
                    systemId: compiled.targetSystemId,
                    name: mission.name,
                    purpose: mission.purpose,
                    objectives: mission.objectives,
                    state: mission.status === "ACTIVE" ? "ACTIVE" : "CREATED",
                    updatedAt: new Date()
                });
            }
            for (const workflow of execution.executionModel.workflows) {
                this.workflows.register({
                    workflowId: workflow.id,
                    systemId: compiled.targetSystemId,
                    steps: workflow.steps,
                    actorIds: workflow.assignedActorIds,
                    state: workflow.status === "READY" ? "READY" : "CREATED",
                    updatedAt: new Date()
                });
            }

            this.state = {
                ...this.state,
                lifecycleState: "INITIALIZED",
                systemIdentity,
                actors: this.identities.actorsForSystem(compiled.targetSystemId),
                domainIds: this.domains.forSystem(compiled.targetSystemId).map(domain => domain.domainId),
                missions: this.missions.all(compiled.targetSystemId),
                workflows: this.workflows.all(compiled.targetSystemId),
                integrations: {
                    executionArtifactId: execution.id,
                    evolutionArtifactId: evolution.id,
                    governanceArtifactId: governance.id
                },
                updatedAt: new Date()
            };
            await this.persist();
            return this.state;
        } catch (error) {
            this.state = {
                ...this.state,
                lifecycleState: "FAILED",
                failureReason: error instanceof Error ? error.message : String(error),
                updatedAt: new Date()
            };
            await this.persist();
            return this.state;
        }
    }

    async activate(): Promise<KernelState> { return this.transition("ACTIVE"); }
    async suspend(): Promise<KernelState> { return this.transition("SUSPENDED"); }
    async shutdown(): Promise<KernelState> { return this.transition("SHUTDOWN"); }

    authorize(actorId: string, action: string): AuthorizationDecision {
        if (this.state.lifecycleState !== "ACTIVE") {
            return { allowed: false, actorId, action, reason: "Kernel is not active." };
        }
        return this.authorization.authorize(this.identities.getActor(actorId), action);
    }

    getState(): KernelState { return this.state; }
    getMissionRuntime(): MissionRuntime { return this.missions; }
    getWorkflowStateMachine(): WorkflowStateMachine { return this.workflows; }
    getDomainRegistry(): DomainRegistry { return this.domains; }

    private async transition(next: KernelLifecycleState): Promise<KernelState> {
        if (!LIFECYCLE_TRANSITIONS[this.state.lifecycleState].includes(next)) {
            throw new Error(`Invalid kernel transition: ${this.state.lifecycleState} -> ${next}`);
        }
        this.state = { ...this.state, lifecycleState: next, updatedAt: new Date() };
        await this.persist();
        return this.state;
    }

    private requireState(expected: KernelLifecycleState): void {
        if (this.state.lifecycleState !== expected) {
            throw new Error(`Kernel must be ${expected} to initialize.`);
        }
    }

    private artifact<T>(compiled: CompiledPbosSystemArtifact, type: string): T {
        const artifact = compiled.artifacts.find(candidate => candidate.artifactType === type);
        if (!artifact) throw new Error(`Compiled system artifact missing required ${type} integration.`);
        return artifact as unknown as T;
    }

    private assertGoverned(governance: GovernanceArtifact): void {
        if (!governance.governanceModel.decisions.some(decision => decision.status === "AUTHORIZED")) {
            throw new Error("Compiled system has no authorized governance decision.");
        }
    }

    private async persist(): Promise<void> {
        if (this.storage && this.systemId) await this.storage.save(this.systemId, this.state);
    }
}
