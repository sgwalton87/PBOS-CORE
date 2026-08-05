import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { GenesisWorkflowService } from "../genesis-workflow-service";

const session = {
    sessionId: "session", activatedAt: new Date(),
    system: { systemId: "BULLETPROOF-SYSTEM-001", operatingSystemId: "BULLETPROOF-OS-001", name: "Bulletproof Beneficiary",
        domain: "Legacy Planning", repository: "vycoywalton/bulletproof-beneficiary-registry", defaultBranch: "main", status: "READY" as const, capabilities: ["IDENTITY"] },
    grant: { grantId: "grant", systemId: "BULLETPROOF-SYSTEM-001", repository: "vycoywalton/bulletproof-beneficiary-registry",
        branchPattern: "agent/*", mode: "READ_ONLY" as const, allowedActions: ["INSPECT_REPOSITORY" as const], deniedActions: [], maximumRisk: "LOW" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }
};

describe("Genesis governed workflow", () => {
    it("stops before repository access when durable authority denies an action", async () => {
        const gateway = new GitHubRepositoryGateway("/tmp/never-used");
        const workflow = new GenesisWorkflowService(gateway, undefined, undefined, (_session, action) => ({
            decisionId: "decision", grantId: "grant", action, allowed: false, reason: "revoked across process", decidedAt: new Date()
        }));
        await expect(workflow.inspectAndPlan(session)).rejects.toThrow("revoked across process");
    });

    it("plans The Playbook with its education blueprint and stable system identity", async () => {
        const playbookSession = {
            ...session,
            system: { ...session.system, systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001",
                name: "The Playbook", domain: "Education", repository: "sgwalton87/playbook-platform" },
            grant: { ...session.grant, systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform" }
        };
        const gateway = {
            inspectRepository: async () => ({
                repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
                revision: "playbook-revision", findings: ["CAPABILITY:IDENTITY:PRESENT"], inspectedAt: new Date()
            })
        } as unknown as GitHubRepositoryGateway;
        const plan = await new GenesisWorkflowService(gateway).inspectAndPlan(playbookSession);
        expect(plan.blueprint.identity.proposedSystemId).toBe("PLAYBOOK-SYSTEM-001");
        expect(plan.blueprint.identity.systemName).toBe("The Playbook");
        expect(plan.blueprint.foundation.domainPack).toBe("@pbos/domain-education");
    });
});
