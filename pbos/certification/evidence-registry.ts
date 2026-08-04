export type CertificationDomain =
    | "GENESIS_COMPILATION" | "KERNEL_FOUNDATION" | "RUNTIME_OPERATION"
    | "INTELLIGENCE_ACTIVATION" | "AUTONOMOUS_OPERATIONS" | "FACTORY_GENERATION"
    | "DISTRIBUTION" | "EVOLUTION" | "EXTERNAL_INTEGRATION";

export type CertificationEvidenceType = "TEST" | "BUILD" | "ARTIFACT" | "APPROVAL" | "LINEAGE";
export type ReadinessCategory = "TECHNICAL" | "GOVERNANCE" | "OPERATIONAL";

export interface CertificationEvidence {
    readonly evidenceId: string;
    readonly systemId: string;
    readonly domain: CertificationDomain;
    readonly type: CertificationEvidenceType;
    readonly readinessCategory: ReadinessCategory;
    readonly reference: string;
    readonly valid: boolean;
    readonly provenance: readonly string[];
    readonly collectedAt: Date;
}

export class CertificationEvidenceRegistry {
    private readonly evidence = new Map<string, CertificationEvidence>();
    register(record: CertificationEvidence): void {
        if (this.evidence.has(record.evidenceId)) throw new Error(`Certification evidence already registered: ${record.evidenceId}`);
        if (!record.reference || record.provenance.length === 0) throw new Error("Certification evidence requires reference and provenance.");
        this.evidence.set(record.evidenceId, record);
    }
    forSystem(systemId: string): readonly CertificationEvidence[] {
        return [...this.evidence.values()].filter(record => record.systemId === systemId);
    }
    forDomain(systemId: string, domain: CertificationDomain): readonly CertificationEvidence[] {
        return this.forSystem(systemId).filter(record => record.domain === domain);
    }
}
