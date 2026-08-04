import { describe, expect, it } from "vitest";
import { SystemRegistry } from "../../acquisition-engine";
import {
    CertificationEngine,
    CertificationEvidenceRegistry,
    EcosystemScorecard
} from "../../certification";
import { KernelRuntime } from "../../kernel";
import {
    CertifiedPromotion,
    GenesisSystemFactory,
    PbosV1ControlPlane,
    RepositoryApproval,
    RepositoryChangeProposal,
    RepositoryConnector,
    RepositoryDispatch,
    RepositoryGateway,
    RepositoryInspection,
    RepositoryReference,
    RepositoryValidationEvidence
} from "../index";

const repository: RepositoryReference = {
    owner: "domain-owner",
    name: "domain-application",
    defaultBranch: "main"
};

class InMemoryRepositoryGateway implements RepositoryGateway {
    inspect(target: RepositoryReference): Promise<RepositoryInspection> {
        return Promise.resolve({ repository: target, revision: "base", findings: [], inspectedAt: new Date() });
    }

    propose(inspection: RepositoryInspection, summary: string, changedPaths: readonly string[]): Promise<RepositoryChangeProposal> {
        return Promise.resolve({
            proposalId: "proposal", repository: inspection.repository, baseRevision: inspection.revision,
            summary, changedPaths, status: "PROPOSED"
        });
    }

    dispatch(proposal: RepositoryChangeProposal, _approval: RepositoryApproval): Promise<RepositoryDispatch> {
        return Promise.resolve({ dispatchId: "dispatch", proposalId: proposal.proposalId, revision: "change", status: "COMPLETED" });
    }

    collectEvidence(dispatch: RepositoryDispatch): Promise<readonly RepositoryValidationEvidence[]> {
        return Promise.resolve([{
            evidenceId: "test-evidence", dispatchId: dispatch.dispatchId, kind: "TEST",
            passed: true, collectedAt: new Date()
        }]);
    }

    promote(dispatch: RepositoryDispatch, _scorecard: EcosystemScorecard): Promise<CertifiedPromotion> {
        return Promise.resolve({
            promotionId: "promotion", dispatchId: dispatch.dispatchId, revision: dispatch.revision,
            status: "PROMOTED", promotedAt: new Date()
        });
    }
}

const certifiedScorecard: EcosystemScorecard = {
    systemId: "domain-system", systemMaturity: 1, integrationMaturity: 1,
    passedDomains: [], failedDomains: [], certificationState: "CERTIFIED", measuredAt: new Date()
};

describe("PBOS platform orchestration boundaries", () => {
    it("generates independent domain systems from the shared PBOS foundation", () => {
        const factory = new GenesisSystemFactory(
            new SystemRegistry(),
            new CertificationEngine(new CertificationEvidenceRegistry())
        );
        const template = {
            systemTemplateId: "pbos-v1", name: "PBOS v1", version: "1.0.0",
            kernelVersion: "1", runtimeVersion: "1", intelligenceVersion: "1",
            allowedDomainTemplateIds: ["education", "legacy"], requiredPolicyIds: [], metadata: {}
        };
        const playbook = factory.generateDomainSystem(template, [{
            domainTemplateId: "education", name: "Education", classification: "EDUCATION",
            version: "1", capabilityIds: [], requiredServiceIds: [], metadata: {}
        }], "Playbook OS", "playbook-owner");
        const bulletproof = factory.generateDomainSystem(template, [{
            domainTemplateId: "legacy", name: "Legacy", classification: "LEGACY",
            version: "1", capabilityIds: [], requiredServiceIds: [], metadata: {}
        }], "Bulletproof OS", "bulletproof-owner");

        expect(playbook.system.sharedFoundation).toEqual(bulletproof.system.sharedFoundation);
        expect(playbook.system.systemId).not.toBe(bulletproof.system.systemId);
    });

    it("creates lineage-backed evolution proposals", () => {
        const factory = new GenesisSystemFactory(
            new SystemRegistry(),
            new CertificationEngine(new CertificationEvidenceRegistry())
        );
        const proposal = factory.createEvolutionProposal({
            systemId: "playbook", opportunities: [{
                opportunityId: "opportunity", systemId: "playbook", observationIds: ["observation"],
                category: "OPTIMIZATION", description: "Improve acquisition", severity: "MEDIUM",
                confidence: 0.9, detectedAt: new Date()
            }],
            proposedChanges: ["Normalize architecture paths"], expectedOutcomes: { portable: true },
            risks: ["Link drift"], rollbackPlan: ["Revert path normalization"]
        });
        expect(proposal.provenance).toEqual(["observation"]);
    });

    it("requires an active kernel and registered domain before domain activation", () => {
        const kernel = {
            getState: () => ({ lifecycleState: "ACTIVE" }),
            getDomainRegistry: () => ({ get: (id: string) => id === "system:education" ? {
                domainId: id, name: "Education", classification: "EDUCATION", version: "1",
                systemIds: ["system"], metadata: {}
            } : undefined })
        } as unknown as KernelRuntime;
        const controlPlane = new PbosV1ControlPlane(kernel);
        expect(controlPlane.activateDomain("system:education").classification).toBe("EDUCATION");
        expect(controlPlane.isDomainActive("system:education")).toBe(true);
        expect(() => controlPlane.activateDomain("unknown")).toThrow("Registered domain not found");
    });

    it("dispatches only explicitly approved repository work", async () => {
        const connector = new RepositoryConnector(new InMemoryRepositoryGateway());
        const inspection = await connector.inspectRepository(repository);
        const proposal = await connector.proposeChange(inspection, "Normalize paths", ["docs/architecture"]);
        expect(() => connector.dispatchApprovedWork(proposal, {
            proposalId: "different", approvedBy: "operator", approvalId: "approval", approvedAt: new Date()
        })).toThrow("matching explicit approval");
        const dispatch = await connector.dispatchApprovedWork(proposal, {
            proposalId: proposal.proposalId, approvedBy: "operator", approvalId: "approval", approvedAt: new Date()
        });
        expect(dispatch.status).toBe("COMPLETED");
    });

    it("promotes only completed, validated, formally certified changes", async () => {
        const connector = new RepositoryConnector(new InMemoryRepositoryGateway());
        const inspection = await connector.inspectRepository(repository);
        const proposal = await connector.proposeChange(inspection, "Governed change", ["src/connector.ts"]);
        const dispatch = await connector.dispatchApprovedWork(proposal, {
            proposalId: proposal.proposalId, approvedBy: "operator", approvalId: "approval", approvedAt: new Date()
        });
        const evidence = await connector.collectValidationEvidence(dispatch);
        const promotion = await connector.promoteCertifiedChange(dispatch, evidence, certifiedScorecard);
        expect(promotion.status).toBe("PROMOTED");

        await expect(connector.promoteCertifiedChange(dispatch, evidence, {
            ...certifiedScorecard, certificationState: "READY_FOR_CERTIFICATION"
        })).rejects.toThrow("formal system certification");
    });
});
