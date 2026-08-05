import { ApplicationScaffoldGenerator } from "../application-scaffold";
import { GenesisBuildPlan, GenesisBuildPlanCompiler } from "../build-planning";
import { GitHubRepositoryGateway, PullRequestReference, RepositoryReference } from "../platform";
import { createBulletproofBlueprint, createPlaybookBlueprint } from "../reference-systems";
import { SystemBlueprint } from "../system-blueprint";
import { GenesisBuildSession } from "./genesis-control-plane";
import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import type { BatchTelemetryReporter, ProgressReporter } from "../operator-continuity/contracts";

export interface PreparedApplicationBuild {
    readonly plan: GenesisBuildPlan;
    readonly branch: string;
    readonly pullRequest: PullRequestReference;
    readonly workPackageCount: number;
    readonly batchId?: string;
}

export class GenesisWorkflowService {
    constructor(
        private readonly gateway: GitHubRepositoryGateway,
        private readonly planner = new GenesisBuildPlanCompiler(),
        private readonly scaffolds = new ApplicationScaffoldGenerator(),
        private readonly authorize?: (session: GenesisBuildSession, action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision,
        private readonly report: ProgressReporter = () => undefined,
        private readonly telemetry?: BatchTelemetryReporter
    ) {}

    async inspectAndPlan(session: GenesisBuildSession): Promise<GenesisBuildPlan> {
        const reference = this.reference(session);
        this.report("INSPECTING", `Reading ${session.system.repository} at its governed revision…`);
        this.requireAuthority(session, "INSPECT_REPOSITORY", "LOW", `agent/plan-${session.system.systemId.toLowerCase()}`);
        this.requireAuthority(session, "CREATE_BUILD_PLAN", "LOW", `agent/plan-${session.system.systemId.toLowerCase()}`);
        const blueprint = this.blueprint(session.system.systemId);
        const inspection = await this.gateway.inspectRepository(reference);
        this.report("PLANNING", "Compiling repository evidence into prioritized work packages…");
        return this.planner.compile(blueprint, inspection);
    }

    async prepareDraftBuild(session: GenesisBuildSession, packageLimit = 10, preparedPlan?: GenesisBuildPlan): Promise<PreparedApplicationBuild> {
        if (session.grant.mode === "READ_ONLY") throw new Error("Read-only sessions cannot prepare application builds.");
        const reference = this.reference(session);
        const plan = preparedPlan ?? await this.inspectAndPlan(session);
        if (plan.status !== "READY_FOR_APPROVAL") throw new Error(`Build plan blocked: ${plan.blockers.join("; ")}`);
        if (!Number.isInteger(packageLimit) || packageLimit < 1 || packageLimit > 10) throw new Error("Package limit must be between 1 and 10.");
        const selectedPackages = plan.workPackages.slice(0, packageLimit);
        const batchId = this.telemetry?.beginBatch(session.system.systemId, session.sessionId, selectedPackages);
        const branch = `agent/pbos-${session.system.systemId.toLowerCase()}-${plan.planId.slice(0, 8)}`;
        for (const [action, risk] of [
            ["PROPOSE_CHANGE", "MEDIUM"], ["MODIFY_APPLICATION_CODE", "MEDIUM"], ["CREATE_TESTS", "MEDIUM"],
            ["CREATE_COMMIT", "MEDIUM"], ["PUSH_BRANCH", "MEDIUM"], ["OPEN_DRAFT_PR", "MEDIUM"]
        ] as readonly (readonly [BuildAction, ActionRisk])[]) this.requireAuthority(session, action, risk, branch);
        this.report("BUILDING", `Generating the application on ${branch}…`);
        selectedPackages.forEach(item => this.telemetry?.packageStarted(batchId!, session.system.systemId, session.sessionId, item.id, item.title));
        await this.gateway.createBranch(reference, branch, plan.repositoryRevision);
        const selectedCapabilities = plan.gaps.slice(0, packageLimit).map(gap => gap.capability as import("../system-blueprint").CapabilityKind);
        const scaffold = this.scaffolds.generate({ blueprint: plan.blueprint, includeFirstVerticalSlice: true,
            capabilities: selectedCapabilities });
        const materialized = await this.scaffolds.materialize(scaffold, {
            writeFiles: files => this.gateway.applyChange(reference, files).then(() => undefined),
            prepareDependencyLock: () => this.gateway.prepareDependencyLock(reference)
        });
        const revision = await this.gateway.commit(reference, `feat: build ${session.system.name} vertical slice`, materialized.generatedPaths);
        selectedPackages.forEach(item => this.telemetry?.packageCompleted(batchId!, session.system.systemId, session.sessionId, item.id, item.title));
        this.report("PUSHING", "Publishing the governed branch and opening a draft pull request…");
        await this.gateway.push(reference, branch);
        const pullRequest = await this.gateway.openDraftPullRequest(reference, branch,
            `feat: build ${session.system.name} vertical slice`,
            `Generated by PBOS Genesis from blueprint ${plan.blueprintId} at repository revision ${plan.repositoryRevision}.\n\nAutonomous batch: ${selectedPackages.length}/${packageLimit} authorized work packages.\n\n${selectedPackages.map((item, index) => `${index + 1}. ${item.title} (${item.id})`).join("\n")}\n\nValidation and certification remain human-controlled gates.\n\nGenerated commit: ${revision}`);
        this.report("VALIDATING", `GitHub Actions will validate ${pullRequest.url}.`);
        return { plan, branch, pullRequest, workPackageCount: selectedPackages.length, batchId };
    }

    authorizeRemediation(session: GenesisBuildSession, branch: string): void {
        for (const [action, risk] of [
            ["MODIFY_APPLICATION_CODE", "MEDIUM"], ["CREATE_TESTS", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"], ["PUSH_BRANCH", "MEDIUM"]
        ] as readonly (readonly [BuildAction, ActionRisk])[]) this.requireAuthority(session, action, risk, branch);
    }

    private reference(session: GenesisBuildSession): RepositoryReference {
        const [owner, name] = session.system.repository.split("/");
        if (!owner || !name) throw new Error(`Invalid repository identity: ${session.system.repository}`);
        return { owner, name, defaultBranch: session.system.defaultBranch };
    }

    private blueprint(systemId: string): SystemBlueprint {
        if (systemId === "PLAYBOOK-SYSTEM-001") return createPlaybookBlueprint();
        if (systemId === "BULLETPROOF-SYSTEM-001") return createBulletproofBlueprint();
        throw new Error(`No certified build blueprint registered for ${systemId}.`);
    }

    private requireAuthority(session: GenesisBuildSession, action: BuildAction, risk: ActionRisk, branch: string): void {
        if (!this.authorize) return;
        const decision = this.authorize(session, action, risk, branch);
        if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
    }
}
