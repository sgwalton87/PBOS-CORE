import {
    CertificationDomain, CertificationEvidenceRegistry, CertificationEvidenceType
} from "./evidence-registry";
import { EcosystemScorecard, EcosystemScorecardEngine } from "./ecosystem-scorecard";
import { SystemReadiness, SystemReadinessEvaluator } from "./system-readiness";

export interface CertificationRequirement {
    readonly domain: CertificationDomain;
    readonly requiredEvidenceTypes: readonly CertificationEvidenceType[];
}

export interface DomainCertificationResult {
    readonly domain: CertificationDomain;
    readonly passed: boolean;
    readonly evidenceIds: readonly string[];
    readonly missingEvidenceTypes: readonly CertificationEvidenceType[];
}

export interface SystemCertificationReport {
    readonly reportId: string;
    readonly systemId: string;
    readonly domainResults: readonly DomainCertificationResult[];
    readonly readiness: SystemReadiness;
    readonly scorecard: EcosystemScorecard;
    readonly status: "NOT_READY" | "READY_FOR_CERTIFICATION";
    readonly generatedAt: Date;
}

export const ECOSYSTEM_CERTIFICATION_DOMAINS: readonly CertificationDomain[] = [
    "GENESIS_COMPILATION", "KERNEL_FOUNDATION", "RUNTIME_OPERATION",
    "INTELLIGENCE_ACTIVATION", "AUTONOMOUS_OPERATIONS", "FACTORY_GENERATION",
    "DISTRIBUTION", "EVOLUTION", "EXTERNAL_INTEGRATION"
];

export class CertificationEngine {
    constructor(
        private readonly registry: CertificationEvidenceRegistry,
        private readonly readiness = new SystemReadinessEvaluator(),
        private readonly scorecards = new EcosystemScorecardEngine()
    ) {}

    certify(systemId: string, requirements: readonly CertificationRequirement[]): SystemCertificationReport {
        const evidence = this.registry.forSystem(systemId);
        const domainResults = requirements.map(requirement => {
            const records = evidence.filter(record => record.domain === requirement.domain && record.valid);
            const available = new Set(records.map(record => record.type));
            const missingEvidenceTypes = requirement.requiredEvidenceTypes.filter(type => !available.has(type));
            return {
                domain: requirement.domain,
                passed: missingEvidenceTypes.length === 0,
                evidenceIds: records.map(record => record.evidenceId),
                missingEvidenceTypes
            };
        });
        const systemReadiness = this.readiness.evaluate(systemId, evidence);
        const domainMap = Object.fromEntries(ECOSYSTEM_CERTIFICATION_DOMAINS.map(domain => [
            domain, domainResults.find(result => result.domain === domain)?.passed ?? false
        ])) as unknown as Record<CertificationDomain, boolean>;
        const scorecard = this.scorecards.calculate(systemId, systemReadiness, domainMap);
        return {
            reportId: crypto.randomUUID(), systemId, domainResults, readiness: systemReadiness, scorecard,
            status: scorecard.certificationState === "READY_FOR_CERTIFICATION" ? "READY_FOR_CERTIFICATION" : "NOT_READY",
            generatedAt: new Date()
        };
    }
}
