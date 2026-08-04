import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { buildBranchForSession, GenesisWorkflowService } from "../genesis-workflow-service";

const session = {
    sessionId: "session", activatedAt: new Date(),
    system: { systemId: "BULLETPROOF-SYSTEM-001", operatingSystemId: "BULLETPROOF-OS-001", name: "Bulletproof Beneficiary",
        domain: "Legacy Planning", repository: "vycoywalton/bulletproof-beneficiary-registry", defaultBranch: "main", status: "READY" as const, capabilities: ["IDENTITY"] },
    grant: { grantId: "grant", systemId: "BULLETPROOF-SYSTEM-001", repository: "vycoywalton/bulletproof-beneficiary-registry",
        branchPattern: "agent/*", mode: "READ_ONLY" as const, allowedActions: ["INSPECT_REPOSITORY" as const], deniedActions: [], maximumRisk: "LOW" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }
};

describe("Genesis governed workflow", () => {
    it("allocates a distinct governed branch for every build session", () => {
        const first = buildBranchForSession("BULLETPROOF-SYSTEM-001", "ba42340c-4431-4cfe-90bf-ac16030f516f");
        const second = buildBranchForSession("BULLETPROOF-SYSTEM-001", "cd53451d-5542-5def-a1c0-bd27141f6270");
        expect(first).toBe("agent/pbos-bulletproof-system-001-vertical-slice-ba42340c4431");
        expect(second).not.toBe(first);
        expect(first).toMatch(/^agent\//);
    });

    it("stops before repository access when durable authority denies an action", async () => {
        const gateway = new GitHubRepositoryGateway("/tmp/never-used");
        const workflow = new GenesisWorkflowService(gateway, undefined, undefined, (_session, action) => ({
            decisionId: "decision", grantId: "grant", action, allowed: false, reason: "revoked across process", decidedAt: new Date()
        }));
        await expect(workflow.inspectAndPlan(session)).rejects.toThrow("revoked across process");
    });
});
