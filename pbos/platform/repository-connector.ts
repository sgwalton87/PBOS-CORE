import { EcosystemScorecard } from "../certification";
import { BuildAuthorityDecision } from "../autonomous-authority";

export interface RepositoryReference {
    readonly owner: string;
    readonly name: string;
    readonly defaultBranch: string;
}

export interface RepositoryInspection {
    readonly repository: RepositoryReference;
    readonly revision: string;
    readonly findings: readonly string[];
    readonly inspectedAt: Date;
    readonly files?: readonly string[];
}

export interface RepositoryChangeProposal {
    readonly proposalId: string;
    readonly repository: RepositoryReference;
    readonly baseRevision: string;
    readonly summary: string;
    readonly changedPaths: readonly string[];
    readonly status: "PROPOSED";
}

export interface RepositoryApproval {
    readonly proposalId: string;
    readonly approvedBy: string;
    readonly approvalId: string;
    readonly approvedAt: Date;
}

export interface RepositoryDispatch {
    readonly dispatchId: string;
    readonly proposalId: string;
    readonly revision: string;
    readonly status: "DISPATCHED" | "COMPLETED";
}

export interface RepositoryValidationEvidence {
    readonly evidenceId: string;
    readonly dispatchId: string;
    readonly kind: "TYPECHECK" | "TEST" | "BUILD" | "REVIEW";
    readonly passed: boolean;
    readonly collectedAt: Date;
}

export interface CertifiedPromotion {
    readonly promotionId: string;
    readonly dispatchId: string;
    readonly revision: string;
    readonly status: "PROMOTED";
    readonly promotedAt: Date;
}

export interface RepositoryGateway {
    inspect(repository: RepositoryReference): Promise<RepositoryInspection>;
    propose(inspection: RepositoryInspection, summary: string, changedPaths: readonly string[]): Promise<RepositoryChangeProposal>;
    dispatch(proposal: RepositoryChangeProposal, approval: RepositoryApproval): Promise<RepositoryDispatch>;
    collectEvidence(dispatch: RepositoryDispatch): Promise<readonly RepositoryValidationEvidence[]>;
    promote(dispatch: RepositoryDispatch, scorecard: EcosystemScorecard): Promise<CertifiedPromotion>;
}

/** Provider-neutral boundary for governed work in application repositories. */
export class RepositoryConnector {
    constructor(private readonly gateway: RepositoryGateway) {}

    inspectRepository(repository: RepositoryReference): Promise<RepositoryInspection> {
        return this.gateway.inspect(repository);
    }

    proposeChange(
        inspection: RepositoryInspection,
        summary: string,
        changedPaths: readonly string[]
    ): Promise<RepositoryChangeProposal> {
        if (!summary || changedPaths.length === 0) {
            throw new Error("Repository proposals require a summary and explicit changed paths.");
        }
        return this.gateway.propose(inspection, summary, changedPaths);
    }

    dispatchApprovedWork(
        proposal: RepositoryChangeProposal,
        approval: RepositoryApproval
    ): Promise<RepositoryDispatch> {
        if (approval.proposalId !== proposal.proposalId || !approval.approvalId || !approval.approvedBy) {
            throw new Error("Repository dispatch requires matching explicit approval.");
        }
        return this.gateway.dispatch(proposal, approval);
    }

    dispatchGovernedWork(
        proposal: RepositoryChangeProposal,
        authority: BuildAuthorityDecision
    ): Promise<RepositoryDispatch> {
        if (!authority.allowed) throw new Error(`Repository dispatch denied: ${authority.reason}`);
        return this.gateway.dispatch(proposal, {
            proposalId: proposal.proposalId,
            approvedBy: "PBOS-V1-DELEGATED-AUTHORITY",
            approvalId: authority.explicitApprovalId ?? `grant:${authority.grantId}:${authority.decisionId}`,
            approvedAt: authority.decidedAt
        });
    }

    async collectValidationEvidence(
        dispatch: RepositoryDispatch
    ): Promise<readonly RepositoryValidationEvidence[]> {
        const evidence = await this.gateway.collectEvidence(dispatch);
        if (evidence.some(record => record.dispatchId !== dispatch.dispatchId)) {
            throw new Error("Validation evidence lineage does not match the repository dispatch.");
        }
        return evidence;
    }

    async promoteCertifiedChange(
        dispatch: RepositoryDispatch,
        evidence: readonly RepositoryValidationEvidence[],
        scorecard: EcosystemScorecard
    ): Promise<CertifiedPromotion> {
        if (dispatch.status !== "COMPLETED") throw new Error("Only completed repository work can be promoted.");
        if (evidence.length === 0 || evidence.some(record => !record.passed || record.dispatchId !== dispatch.dispatchId)) {
            throw new Error("Promotion requires complete, passing validation evidence.");
        }
        if (scorecard.certificationState !== "CERTIFIED") {
            throw new Error("Promotion requires formal system certification.");
        }
        return this.gateway.promote(dispatch, scorecard);
    }
}
