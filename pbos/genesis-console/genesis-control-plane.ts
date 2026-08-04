import { randomUUID } from "crypto";
import {
    AuthorityMode,
    AutonomousBuildGrant,
    BuildAction,
    BuildAuthorityDecision,
    BuildAuthorityService
} from "../autonomous-authority";
import { GenesisSystemCatalog } from "./system-catalog";
import { GenesisSystemDefinition } from "./system-definition";
import { GenesisStateRepository } from "../genesis-state/genesis-state-repository";

export interface GenesisBuildSession {
    readonly sessionId: string;
    readonly system: GenesisSystemDefinition;
    readonly grant: AutonomousBuildGrant;
    readonly activatedAt: Date;
}

const READ_ACTIONS: readonly BuildAction[] = [
    "INSPECT_REPOSITORY", "READ_SYSTEM_STATUS", "CREATE_BUILD_PLAN"
];

const BUILD_ACTIONS: readonly BuildAction[] = [
    ...READ_ACTIONS,
    "PROPOSE_CHANGE", "MODIFY_APPLICATION_CODE", "CREATE_TESTS", "UPDATE_DOCUMENTATION",
    "CREATE_COMMIT", "PUSH_BRANCH", "OPEN_DRAFT_PR",
    "MERGE_MAIN", "DEPLOY_PRODUCTION", "DESTRUCTIVE_MIGRATION", "MANAGE_SECRETS",
    "CERTIFY_SYSTEM", "CROSS_REPOSITORY_CHANGE"
];

export class GenesisControlPlane {
    private readonly sessions = new Map<string, GenesisBuildSession>();

    constructor(
        private readonly systems: GenesisSystemCatalog,
        private readonly authority = new BuildAuthorityService(),
        private readonly state?: GenesisStateRepository
    ) {}

    listSystems(): readonly GenesisSystemDefinition[] {
        return this.systems.all();
    }

    activateSystem(
        systemId: string,
        mode: AuthorityMode,
        operatorId: string,
        issuanceApprovalId: string
    ): GenesisBuildSession {
        const system = this.systems.get(systemId);
        if (!system) throw new Error(`Genesis system not found: ${systemId}`);
        if (system.status === "SUSPENDED") throw new Error(`Genesis system is suspended: ${systemId}`);
        const allowedActions = mode === "READ_ONLY" ? READ_ACTIONS : BUILD_ACTIONS;
        const grant = this.authority.issue({
            systemId,
            repository: system.repository,
            branchPattern: "agent/*",
            mode,
            allowedActions,
            deniedActions: [],
            maximumRisk: mode === "READ_ONLY" ? "LOW" : "MEDIUM",
            issuedBy: operatorId,
            issuanceApprovalId,
            durationMinutes: 480
        });
        const session = { sessionId: randomUUID(), system, grant, activatedAt: new Date() };
        this.sessions.set(session.sessionId, session);
        this.state?.saveSession(session);
        return session;
    }

    authorizeAction(
        sessionId: string,
        action: BuildAction,
        risk: "LOW" | "MEDIUM" | "HIGH" | "IRREVERSIBLE",
        branch: string,
        explicitApprovalId?: string
    ): BuildAuthorityDecision {
        const session = this.sessions.get(sessionId) ?? this.state?.sessions().find(candidate => candidate.sessionId === sessionId);
        if (!session) throw new Error(`Genesis build session not found: ${sessionId}`);
        return this.authority.authorize({
            grantId: session.grant.grantId,
            systemId: session.system.systemId,
            repository: session.system.repository,
            branch,
            action,
            risk,
            explicitApprovalId,
            requestedAt: new Date()
        });
    }

    revokeSession(sessionId: string, reason: string): AutonomousBuildGrant {
        const session = this.sessions.get(sessionId) ?? this.state?.sessions().find(candidate => candidate.sessionId === sessionId);
        if (!session) throw new Error(`Genesis build session not found: ${sessionId}`);
        return this.authority.revoke(session.grant.grantId, reason);
    }
}
