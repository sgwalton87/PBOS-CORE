import { describe, expect, it } from "vitest";
import { BuildAction, BuildAuthorityService } from "../index";

const buildActions: readonly BuildAction[] = [
    "INSPECT_REPOSITORY",
    "MODIFY_APPLICATION_CODE",
    "OPEN_DRAFT_PR",
    "MERGE_MAIN",
    "DEPLOY_PRODUCTION"
];

function request(grantId: string, action: BuildAction, risk: "LOW" | "MEDIUM" | "HIGH" = "LOW") {
    return {
        grantId,
        systemId: "PLAYBOOK-SYSTEM-001",
        repository: "sgwalton87/playbook-platform",
        branch: "agent/playbook-build",
        action,
        risk,
        requestedAt: new Date()
    } as const;
}

describe("delegated autonomous build authority", () => {
    it("allows only observation and planning in read-only mode", () => {
        const authority = new BuildAuthorityService();
        const grant = authority.issue({
            systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
            branchPattern: "agent/*", mode: "READ_ONLY", allowedActions: buildActions,
            maximumRisk: "LOW", issuedBy: "operator", issuanceApprovalId: "approval", durationMinutes: 60
        });
        expect(authority.authorize(request(grant.grantId, "INSPECT_REPOSITORY")).allowed).toBe(true);
        expect(authority.authorize(request(grant.grantId, "MODIFY_APPLICATION_CODE")).allowed).toBe(false);
    });

    it("requires per-action approval in human-gated mode", () => {
        const authority = new BuildAuthorityService();
        const grant = authority.issue({
            systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
            branchPattern: "agent/*", mode: "HUMAN_GATED", allowedActions: buildActions,
            maximumRisk: "MEDIUM", issuedBy: "operator", issuanceApprovalId: "approval", durationMinutes: 60
        });
        expect(authority.authorize(request(grant.grantId, "MODIFY_APPLICATION_CODE")).allowed).toBe(false);
        expect(authority.authorize({
            ...request(grant.grantId, "MODIFY_APPLICATION_CODE"), explicitApprovalId: "action-approval"
        }).allowed).toBe(true);
    });

    it("allows bounded autonomous builds but gates protected actions", () => {
        const authority = new BuildAuthorityService();
        const grant = authority.issue({
            systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
            branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY", allowedActions: buildActions,
            maximumRisk: "MEDIUM", issuedBy: "operator", issuanceApprovalId: "approval", durationMinutes: 60
        });
        expect(authority.authorize(request(grant.grantId, "MODIFY_APPLICATION_CODE", "MEDIUM")).allowed).toBe(true);
        expect(authority.authorize(request(grant.grantId, "MERGE_MAIN", "HIGH")).allowed).toBe(false);
        expect(authority.authorize({
            ...request(grant.grantId, "MERGE_MAIN", "HIGH"), explicitApprovalId: "merge-approval"
        }).allowed).toBe(true);
    });

    it("denies expired, revoked, wrong-repository, and wrong-branch requests", () => {
        const authority = new BuildAuthorityService();
        const grant = authority.issue({
            systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
            branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY", allowedActions: buildActions,
            maximumRisk: "MEDIUM", issuedBy: "operator", issuanceApprovalId: "approval", durationMinutes: 60
        });
        expect(authority.authorize({ ...request(grant.grantId, "INSPECT_REPOSITORY"), repository: "other/repo" }).allowed).toBe(false);
        expect(authority.authorize({ ...request(grant.grantId, "INSPECT_REPOSITORY"), branch: "main" }).allowed).toBe(false);
        authority.revoke(grant.grantId, "Operator stopped build session.");
        expect(authority.authorize(request(grant.grantId, "INSPECT_REPOSITORY")).allowed).toBe(false);
        expect(authority.audit(grant.grantId)).toHaveLength(3);
    });
});
