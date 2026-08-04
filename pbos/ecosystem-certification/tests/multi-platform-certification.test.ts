import { describe, expect, it } from "vitest";
import { CertifiedPlatform, EcosystemSystemCandidate, MultiPlatformCertificationEngine, PlatformReadinessDomain } from "../index";

const platforms: CertifiedPlatform[] = ["WEB", "IOS", "ANDROID"];
const domains: PlatformReadinessDomain[] = ["PRIVACY", "IDENTITY", "AUTHORITY", "PROVENANCE", "ACCESSIBILITY", "SECURITY", "OPERATIONAL", "COMMERCIAL"];
const candidate = (name: "PLAYBOOK" | "BULLETPROOF", certified = false): EcosystemSystemCandidate => ({
    systemId: `${name}-SYSTEM-001`, applicationId: `${name}-APPLICATION-001`, repository: name === "PLAYBOOK"
        ? "sgwalton87/playbook-platform" : "vycoywalton/bulletproof-beneficiary-registry", revision: name === "PLAYBOOK" ? "a".repeat(40) : "b".repeat(40),
    brandId: `${name}-BRAND-001`, dataOwnershipBoundary: `${name}-DATA-001`, releaseAuthority: `${name}-RELEASE-AUTHORITY`,
    pbosContractVersion: "1.0.0", evidence: platforms.flatMap(platform => domains.map(domain => ({
        evidenceId: `${name}-${platform}-${domain}`, platform, domain, valid: true, reference: `evidence://${name}/${platform}/${domain}`,
        provenance: ["PBOS-GENESIS", `${name}-APPLICATION-001`] }))),
    approvalIds: { WEB: `${name}-WEB-APPROVAL`, IOS: `${name}-IOS-APPROVAL`, ANDROID: `${name}-ANDROID-APPROVAL` },
    approvalIssuers: { WEB: "PBOS-HUMAN-GOVERNANCE", IOS: "PBOS-HUMAN-GOVERNANCE", ANDROID: "PBOS-HUMAN-GOVERNANCE" },
    humanCertificationId: certified ? `${name}-HUMAN-CERTIFICATION` : undefined,
    humanCertificationIssuer: certified ? "PBOS-HUMAN-CERTIFICATION-BOARD" : undefined,
    externalReviewOutcomes: { APPLE: undefined, GOOGLE: undefined }
});

describe("CIP-050 multi-platform ecosystem certification", () => {
    it("keeps independent systems ready until separate human certifications exist", () => {
        const report = new MultiPlatformCertificationEngine().evaluate([candidate("PLAYBOOK"), candidate("BULLETPROOF")]);
        expect(report.independenceProven).toBe(true);
        expect(report.sharedContractVersion).toBe("1.0.0");
        expect(report.status).toBe("READY_FOR_HUMAN_CERTIFICATION");
        expect(report.systems.every(system => system.platforms.every(platform => platform.score === 1))).toBe(true);
    });

    it("certifies only after both independent human decisions", () => {
        expect(new MultiPlatformCertificationEngine().evaluate([candidate("PLAYBOOK", true), candidate("BULLETPROOF", true)]).status)
            .toBe("CERTIFIED");
    });

    it("fails closed for missing platform evidence, approvals, or ownership isolation", () => {
        const playbook = candidate("PLAYBOOK");
        const incomplete = { ...playbook, evidence: playbook.evidence.filter(item => !(item.platform === "IOS" && item.domain === "PRIVACY")) };
        expect(new MultiPlatformCertificationEngine().evaluate([incomplete, candidate("BULLETPROOF")]).status).toBe("NOT_READY");
        expect(new MultiPlatformCertificationEngine().evaluate([{ ...playbook, approvalIds: { ...playbook.approvalIds, WEB: undefined } }, candidate("BULLETPROOF")]).status).toBe("NOT_READY");
        expect(new MultiPlatformCertificationEngine().evaluate([{ ...playbook,
            approvalIssuers: { ...playbook.approvalIssuers, WEB: playbook.applicationId } }, candidate("BULLETPROOF")]).status).toBe("NOT_READY");
        expect(new MultiPlatformCertificationEngine().evaluate([playbook, { ...candidate("BULLETPROOF"), brandId: playbook.brandId }]).independenceProven).toBe(false);
    });

    it("does not accept application-issued final certification", () => {
        const playbook = { ...candidate("PLAYBOOK", true), humanCertificationIssuer: "PLAYBOOK-APPLICATION-001" };
        expect(new MultiPlatformCertificationEngine().evaluate([playbook, candidate("BULLETPROOF", true)]).status)
            .toBe("READY_FOR_HUMAN_CERTIFICATION");
    });
});
