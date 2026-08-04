import { randomUUID } from "crypto";
import { AuthorityLedger } from "./authority-ledger";
import {
    ActionRisk,
    AutonomousBuildGrant,
    BuildAuthorityDecision,
    BuildAuthorityRequest,
    BuildGrantRequest,
    PROTECTED_BUILD_ACTIONS
} from "./contracts";
import { BuildGrantRegistry } from "./grant-registry";

const RISK_RANK: Readonly<Record<ActionRisk, number>> = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    IRREVERSIBLE: 3
};

const READ_ONLY_ACTIONS = new Set(["INSPECT_REPOSITORY", "READ_SYSTEM_STATUS", "CREATE_BUILD_PLAN"]);

export class BuildAuthorityService {
    constructor(
        private readonly grants = new BuildGrantRegistry(),
        private readonly ledger = new AuthorityLedger()
    ) {}

    issue(request: BuildGrantRequest, now = new Date()): AutonomousBuildGrant {
        if (!request.issuanceApprovalId || !request.issuedBy) {
            throw new Error("Build authority requires explicit Genesis issuance approval.");
        }
        if (request.durationMinutes <= 0) throw new Error("Build grant duration must be positive.");
        if (request.allowedActions.length === 0) throw new Error("Build grant requires at least one allowed action.");
        const grant: AutonomousBuildGrant = {
            grantId: randomUUID(),
            systemId: request.systemId,
            repository: request.repository,
            branchPattern: request.branchPattern,
            mode: request.mode,
            allowedActions: [...new Set(request.allowedActions)],
            deniedActions: [...new Set(request.deniedActions ?? [])],
            maximumRisk: request.maximumRisk,
            issuedBy: request.issuedBy,
            issuanceApprovalId: request.issuanceApprovalId,
            issuedAt: now,
            expiresAt: new Date(now.getTime() + request.durationMinutes * 60_000)
        };
        this.grants.register(grant);
        return grant;
    }

    authorize(request: BuildAuthorityRequest): BuildAuthorityDecision {
        const grant = this.grants.get(request.grantId);
        const decision = this.evaluate(grant, request);
        this.ledger.record(request, decision);
        return decision;
    }

    revoke(grantId: string, reason: string, at = new Date()): AutonomousBuildGrant {
        const grant = this.grants.get(grantId);
        if (!grant) throw new Error(`Build grant not found: ${grantId}`);
        if (!reason) throw new Error("Build grant revocation requires a reason.");
        const revoked = { ...grant, revokedAt: at, revocationReason: reason };
        this.grants.update(revoked);
        return revoked;
    }

    audit(grantId: string) {
        return this.ledger.forGrant(grantId);
    }

    private evaluate(grant: AutonomousBuildGrant | undefined, request: BuildAuthorityRequest): BuildAuthorityDecision {
        const deny = (reason: string): BuildAuthorityDecision => ({
            decisionId: randomUUID(), grantId: request.grantId, action: request.action,
            allowed: false, reason, explicitApprovalId: request.explicitApprovalId, decidedAt: new Date()
        });
        const allow = (reason: string): BuildAuthorityDecision => ({
            decisionId: randomUUID(), grantId: request.grantId, action: request.action,
            allowed: true, reason, explicitApprovalId: request.explicitApprovalId, decidedAt: new Date()
        });

        if (!grant) return deny("Build grant not found.");
        if (grant.revokedAt) return deny("Build grant has been revoked.");
        if (grant.expiresAt <= request.requestedAt) return deny("Build grant has expired.");
        if (grant.systemId !== request.systemId || grant.repository !== request.repository) return deny("Build request exceeds its system or repository boundary.");
        if (!this.matchesBranch(grant.branchPattern, request.branch)) return deny("Build request exceeds its branch boundary.");
        if (grant.deniedActions.includes(request.action) || !grant.allowedActions.includes(request.action)) return deny("Build action is outside the delegated scope.");
        if (RISK_RANK[request.risk] > RISK_RANK[grant.maximumRisk] && !request.explicitApprovalId) {
            return deny("Build action exceeds the delegated risk ceiling and requires explicit human approval.");
        }
        if (grant.mode === "READ_ONLY" && !READ_ONLY_ACTIONS.has(request.action)) return deny("Read-only authority cannot mutate repository state.");
        if (grant.mode === "HUMAN_GATED" && !READ_ONLY_ACTIONS.has(request.action) && !request.explicitApprovalId) {
            return deny("Human-gated authority requires explicit action approval.");
        }
        if (PROTECTED_BUILD_ACTIONS.includes(request.action) && !request.explicitApprovalId) {
            return deny("Protected action requires explicit human approval.");
        }
        return allow(grant.mode === "DELEGATED_AUTONOMY"
            ? "Action authorized by bounded Genesis delegation."
            : request.explicitApprovalId ? "Action authorized by explicit human approval." : "Read-only action authorized.");
    }

    private matchesBranch(pattern: string, branch: string): boolean {
        if (pattern.endsWith("*")) return branch.startsWith(pattern.slice(0, -1));
        return pattern === branch;
    }
}
