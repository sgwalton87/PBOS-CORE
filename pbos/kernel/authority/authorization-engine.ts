import { ActorIdentity } from "../identity/actor-identity";
import { AuthorizationDecision } from "./authority-contract";
import { PermissionRegistry } from "./permission-registry";

export class AuthorizationEngine {
    constructor(private readonly permissions: PermissionRegistry) {}

    authorize(actor: ActorIdentity | undefined, action: string): AuthorizationDecision {
        if (!actor || !actor.active) {
            return { allowed: false, actorId: actor?.actorId ?? "UNKNOWN", action, reason: "Unknown or inactive actor." };
        }
        const grant = this.permissions.forActor(actor.actorId).find(candidate =>
            actor.authorityContext.includes(candidate.authorityId) &&
            candidate.systemId === actor.systemId &&
            candidate.active &&
            candidate.governanceDecisionIds.length > 0 &&
            candidate.allowedActions.includes(action)
        );
        if (!grant) {
            return { allowed: false, actorId: actor.actorId, action, reason: "No governed authority permits this action." };
        }
        return {
            allowed: true,
            actorId: actor.actorId,
            action,
            authorityId: grant.authorityId,
            reason: "Action permitted by governed authority."
        };
    }
}
