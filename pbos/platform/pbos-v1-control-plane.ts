import { randomUUID } from "crypto";
import {
    ActionHandler,
    AutonomousExecutionResult,
    AutonomousExecutor,
    HumanApprovalGate,
    MissionRequest,
    PlanningEngine,
    RequestedAction
} from "../autonomy";
import { CompiledPbosSystemArtifact } from "../compiler-runtime";
import { ObservationContract, ObservationEngine } from "../evolution-engine";
import {
    IntelligenceRequest,
    IntelligenceSource,
    ReasoningEngine,
    ReasoningResult
} from "../intelligence";
import { AuthorizationDecision, DomainContract, KernelRuntime, KernelState } from "../kernel";
import { RuntimeInstance } from "../runtime-deployment";

export interface MissionExecutionRequest {
    readonly mission: MissionRequest;
    readonly actions: readonly RequestedAction[];
    readonly authorizationAction: string;
    readonly handlers: Readonly<Record<string, ActionHandler>>;
    readonly humanApprovalId?: string;
}

export interface IntelligenceExecutionRequest {
    readonly instance: RuntimeInstance;
    readonly actorId: string;
    readonly capabilityId: string;
    readonly purpose: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly sources: readonly IntelligenceSource[];
    readonly authorizationAction?: string;
}

/** Governed PBOS v1 entry point for domain runtimes. */
export class PbosV1ControlPlane {
    private readonly activeDomains = new Set<string>();

    constructor(
        private readonly kernel = new KernelRuntime(),
        private readonly planning = new PlanningEngine(),
        private readonly approval = new HumanApprovalGate(),
        private readonly executor = new AutonomousExecutor(),
        private readonly reasoning = new ReasoningEngine(),
        private readonly observations = new ObservationEngine()
    ) {}

    async initializeSystem(compiled: CompiledPbosSystemArtifact): Promise<KernelState> {
        const initialized = await this.kernel.initialize(compiled);
        if (initialized.lifecycleState !== "INITIALIZED") return initialized;
        return this.kernel.activate();
    }

    activateDomain(domainId: string): DomainContract {
        if (this.kernel.getState().lifecycleState !== "ACTIVE") {
            throw new Error("Domain activation requires an active PBOS kernel.");
        }
        const domain = this.kernel.getDomainRegistry().get(domainId);
        if (!domain) throw new Error(`Registered domain not found: ${domainId}`);
        this.activeDomains.add(domainId);
        return domain;
    }

    authorizeAction(actorId: string, action: string): AuthorizationDecision {
        return this.kernel.authorize(actorId, action);
    }

    async executeMission(request: MissionExecutionRequest): Promise<AutonomousExecutionResult> {
        if (request.mission.systemId !== this.kernel.getState().systemIdentity?.systemId) {
            throw new Error("Cross-system mission execution denied.");
        }
        const plan = this.planning.plan(request.mission, request.actions);
        const authority = this.authorizeAction(request.mission.requestedBy, request.authorizationAction);
        const approval = this.approval.evaluate(plan, authority, request.humanApprovalId);
        return this.executor.execute(plan, approval, request.handlers);
    }

    requestIntelligence(request: IntelligenceExecutionRequest): ReasoningResult {
        if (request.instance.systemId !== this.kernel.getState().systemIdentity?.systemId) {
            throw new Error("Cross-system intelligence request denied.");
        }
        if (request.instance.lifecycleState !== "ACTIVE") {
            throw new Error("Intelligence requires an active runtime instance.");
        }
        const authority = this.authorizeAction(
            request.actorId,
            request.authorizationAction ?? "REQUEST_INTELLIGENCE"
        );
        if (!authority.allowed) throw new Error(`Intelligence request denied: ${authority.reason}`);
        if (request.sources.some(source => !source.approved)) {
            throw new Error("Intelligence request contains unapproved sources.");
        }
        const intelligenceRequest: IntelligenceRequest = {
            requestId: randomUUID(),
            capabilityId: request.capabilityId,
            requestedBy: request.actorId,
            purpose: request.purpose,
            context: {
                contextId: randomUUID(),
                instanceId: request.instance.instanceId,
                systemId: request.instance.systemId,
                actorId: request.actorId,
                sources: [...request.sources],
                provenance: [...new Set(request.sources.flatMap(source => source.provenance))],
                createdAt: new Date()
            },
            input: request.input,
            requestedAt: new Date()
        };
        return this.reasoning.reason(intelligenceRequest);
    }

    observeOutcome(executionId: string, metric: string, value: unknown): ObservationContract {
        return this.observations.observe(executionId, metric, value);
    }

    isDomainActive(domainId: string): boolean {
        return this.activeDomains.has(domainId);
    }
}
