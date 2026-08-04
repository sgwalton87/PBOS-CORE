import { describe, expect, it } from "vitest";
import {
    CertificationEngine, CertificationEvidenceRegistry, CertificationRequirement,
    ECOSYSTEM_CERTIFICATION_DOMAINS, EcosystemScorecardEngine, SystemReadinessEvaluator
} from "../index";

function preparedRegistry(systemIds: readonly string[]): CertificationEvidenceRegistry {
    const registry = new CertificationEvidenceRegistry();
    const categories = ["TECHNICAL", "GOVERNANCE", "OPERATIONAL"] as const;
    for (const systemId of systemIds) {
        ECOSYSTEM_CERTIFICATION_DOMAINS.forEach((domain, index) => registry.register({
            evidenceId: `${systemId}:${domain}`,
            systemId,
            domain,
            type: "ARTIFACT",
            readinessCategory: categories[index % categories.length],
            reference: `artifact://${systemId}/${domain}`,
            valid: true,
            provenance: [`lineage:${systemId}`, domain],
            collectedAt: new Date()
        }));
    }
    return registry;
}

const requirements: readonly CertificationRequirement[] = ECOSYSTEM_CERTIFICATION_DOMAINS.map(domain => ({
    domain,
    requiredEvidenceTypes: ["ARTIFACT"]
}));

describe("PBOS Ecosystem Operating System Certification", () => {
    it("registers immutable test, build, artifact, approval, and lineage evidence", () => {
        const registry = new CertificationEvidenceRegistry();
        for (const [index, type] of (["TEST", "BUILD", "ARTIFACT", "APPROVAL", "LINEAGE"] as const).entries()) {
            registry.register({
                evidenceId: `evidence-${index}`, systemId: "system", domain: "GENESIS_COMPILATION",
                type, readinessCategory: index < 2 ? "TECHNICAL" : index === 3 ? "GOVERNANCE" : "OPERATIONAL",
                reference: `evidence://${type}`, valid: true, provenance: ["validation-run"], collectedAt: new Date()
            });
        }
        expect(registry.forSystem("system")).toHaveLength(5);
        expect(() => registry.register(registry.forSystem("system")[0])).toThrow("already registered");
    });

    it("evaluates technical, governance, and operational readiness", () => {
        const evidence = preparedRegistry(["system"]).forSystem("system");
        const readiness = new SystemReadinessEvaluator().evaluate("system", evidence);
        expect(readiness.ready).toBe(true);
        expect(readiness.technical.score).toBe(1);
        expect(readiness.governance.score).toBe(1);
        expect(readiness.operational.score).toBe(1);
    });

    it("fails certification when a required domain lacks evidence", () => {
        const registry = preparedRegistry(["system"]);
        const incomplete = requirements.map(requirement => requirement.domain === "EXTERNAL_INTEGRATION"
            ? { ...requirement, requiredEvidenceTypes: ["ARTIFACT", "APPROVAL"] as const }
            : requirement);
        const report = new CertificationEngine(registry).certify("system", incomplete);
        expect(report.status).toBe("NOT_READY");
        expect(report.scorecard.failedDomains).toEqual(["EXTERNAL_INTEGRATION"]);
    });

    it("produces ecosystem maturity and certification scorecards", () => {
        const registry = preparedRegistry(["system"]);
        const report = new CertificationEngine(registry).certify("system", requirements);
        expect(report.status).toBe("READY_FOR_CERTIFICATION");
        expect(report.scorecard.systemMaturity).toBe(1);
        expect(report.scorecard.integrationMaturity).toBe(1);
        const certified = new EcosystemScorecardEngine().calculate(
            "system", report.readiness,
            Object.fromEntries(ECOSYSTEM_CERTIFICATION_DOMAINS.map(domain => [domain, true])) as Record<(typeof ECOSYSTEM_CERTIFICATION_DOMAINS)[number], boolean>,
            true
        );
        expect(certified.certificationState).toBe("CERTIFIED");
    });

    it("supports independent PBOS-powered reference systems", () => {
        const registry = preparedRegistry(["PLAYBOOK-OS", "BULLETPROOF-OS"]);
        const engine = new CertificationEngine(registry);
        const playbook = engine.certify("PLAYBOOK-OS", requirements);
        const bulletproof = engine.certify("BULLETPROOF-OS", requirements);
        expect(playbook.status).toBe("READY_FOR_CERTIFICATION");
        expect(bulletproof.status).toBe("READY_FOR_CERTIFICATION");
        expect(playbook.reportId).not.toBe(bulletproof.reportId);
        expect(playbook.domainResults.map(result => result.domain)).toEqual(bulletproof.domainResults.map(result => result.domain));
    });
});
