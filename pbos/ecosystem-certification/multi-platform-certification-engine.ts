import { randomUUID } from "node:crypto";
import { CertifiedPlatform, EcosystemSystemCandidate, EcosystemSystemCertificationResult, MultiPlatformEcosystemReport, PlatformReadinessDomain } from "./contracts";

const PLATFORMS: readonly CertifiedPlatform[] = ["WEB", "IOS", "ANDROID"];
const DOMAINS: readonly PlatformReadinessDomain[] = ["PRIVACY", "IDENTITY", "AUTHORITY", "PROVENANCE", "ACCESSIBILITY", "SECURITY", "OPERATIONAL", "COMMERCIAL"];

export class MultiPlatformCertificationEngine {
    evaluate(candidates: readonly EcosystemSystemCandidate[]): MultiPlatformEcosystemReport {
        if (candidates.length !== 2) throw new Error("CIP-050 requires exactly two independent reference-system candidates.");
        candidates.forEach(candidate => this.validate(candidate));
        const systems = candidates.map(candidate => this.system(candidate));
        const versions = new Set(candidates.map(candidate => candidate.pbosContractVersion));
        const approvalIds = candidates.flatMap(candidate => Object.values(candidate.approvalIds))
            .filter((value): value is string => Boolean(value));
        const evidenceIds = candidates.flatMap(candidate => candidate.evidence.map(item => item.evidenceId));
        const certificationIds = candidates.map(candidate => candidate.humanCertificationId)
            .filter((value): value is string => Boolean(value));
        const independenceProven = versions.size === 1
            && new Set(candidates.map(candidate => candidate.systemId)).size === candidates.length
            && new Set(candidates.map(candidate => candidate.applicationId)).size === candidates.length
            && new Set(candidates.map(candidate => candidate.repository)).size === candidates.length
            && new Set(candidates.map(candidate => candidate.brandId)).size === candidates.length
            && new Set(candidates.map(candidate => candidate.dataOwnershipBoundary)).size === candidates.length
            && new Set(candidates.map(candidate => candidate.releaseAuthority)).size === candidates.length
            && new Set(approvalIds).size === approvalIds.length
            && new Set(evidenceIds).size === evidenceIds.length
            && new Set(certificationIds).size === certificationIds.length;
        const allReady = independenceProven && systems.every(system => system.status !== "NOT_READY");
        const allCertified = allReady && systems.every(system => system.status === "CERTIFIED");
        return { reportId: randomUUID(), systems, sharedContractVersion: versions.size === 1 ? candidates[0].pbosContractVersion : undefined,
            independenceProven, lineage: candidates.flatMap(candidate => [candidate.systemId, candidate.applicationId,
                candidate.repository, candidate.revision, candidate.brandId, candidate.dataOwnershipBoundary,
                candidate.releaseAuthority, ...Object.values(candidate.approvalIds), ...Object.values(candidate.approvalIssuers),
                candidate.humanCertificationId, candidate.humanCertificationIssuer, ...Object.values(candidate.externalReviewOutcomes),
                ...candidate.evidence.flatMap(item => [item.evidenceId, ...item.provenance])]
                .filter((value): value is string => Boolean(value))),
            status: allCertified ? "CERTIFIED" : allReady ? "READY_FOR_HUMAN_CERTIFICATION" : "NOT_READY", generatedAt: new Date() };
    }

    private validate(candidate: EcosystemSystemCandidate): void {
        const required = [candidate.systemId, candidate.applicationId, candidate.repository, candidate.revision,
            candidate.brandId, candidate.dataOwnershipBoundary, candidate.releaseAuthority, candidate.pbosContractVersion];
        if (required.some(value => !value.trim()) || !candidate.repository.includes("/") || !/^[a-f0-9]{7,40}$/i.test(candidate.revision)) {
            throw new Error("CIP-050 candidates require complete identity and exact repository lineage.");
        }
        if (candidate.evidence.some(item => !item.evidenceId.trim() || !item.reference.trim() || item.provenance.length === 0)) {
            throw new Error("CIP-050 evidence requires identity, reference, and provenance.");
        }
        if (new Set(candidate.evidence.map(item => item.evidenceId)).size !== candidate.evidence.length) {
            throw new Error("CIP-050 evidence identifiers must be unique within each application candidate.");
        }
        const approvalIds = Object.values(candidate.approvalIds).filter((value): value is string => Boolean(value));
        if (new Set(approvalIds).size !== approvalIds.length) {
            throw new Error("CIP-050 platform approvals must carry distinct identifiers.");
        }
        if (candidate.evidence.some(item => item.provenance.includes(candidate.applicationId) && item.domain === "AUTHORITY"
            && item.provenance.includes("SELF_AUTHORIZED"))) {
            throw new Error("External applications cannot self-authorize CIP-050 evidence.");
        }
    }

    private system(candidate: EcosystemSystemCandidate): EcosystemSystemCertificationResult {
        const platforms = PLATFORMS.map(platform => {
            const valid = candidate.evidence.filter(item => item.platform === platform && item.valid);
            const available = new Set(valid.map(item => item.domain));
            const missingDomains = DOMAINS.filter(domain => !available.has(domain));
            const approvalId = candidate.approvalIds[platform]?.trim() || undefined;
            const approvalIssuer = candidate.approvalIssuers[platform]?.trim() || undefined;
            const independentApproval = Boolean(approvalId && approvalIssuer
                && approvalIssuer !== candidate.applicationId && approvalIssuer !== candidate.systemId);
            return { platform, ready: missingDomains.length === 0 && independentApproval, score: available.size / DOMAINS.length,
                evidenceIds: valid.map(item => item.evidenceId), missingDomains, approvalId, approvalIssuer };
        });
        const ready = platforms.every(platform => platform.ready);
        const independentCertification = Boolean(candidate.humanCertificationId && candidate.humanCertificationIssuer
            && candidate.humanCertificationIssuer !== candidate.applicationId && candidate.humanCertificationIssuer !== candidate.systemId);
        return { systemId: candidate.systemId, applicationId: candidate.applicationId, platforms,
            status: ready && independentCertification ? "CERTIFIED" : ready ? "READY_FOR_HUMAN_CERTIFICATION" : "NOT_READY",
            humanCertificationId: candidate.humanCertificationId, humanCertificationIssuer: candidate.humanCertificationIssuer,
            externalReviewOutcomes: candidate.externalReviewOutcomes };
    }
}
