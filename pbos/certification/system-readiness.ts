import { CertificationEvidence, ReadinessCategory } from "./evidence-registry";

export interface ReadinessDimension {
    readonly category: ReadinessCategory;
    readonly score: number;
    readonly ready: boolean;
    readonly evidenceIds: readonly string[];
}

export interface SystemReadiness {
    readonly systemId: string;
    readonly technical: ReadinessDimension;
    readonly governance: ReadinessDimension;
    readonly operational: ReadinessDimension;
    readonly ready: boolean;
    readonly evaluatedAt: Date;
}

export class SystemReadinessEvaluator {
    evaluate(systemId: string, evidence: readonly CertificationEvidence[]): SystemReadiness {
        const dimension = (category: ReadinessCategory): ReadinessDimension => {
            const records = evidence.filter(record => record.readinessCategory === category);
            const score = records.length === 0 ? 0 : records.filter(record => record.valid).length / records.length;
            return { category, score, ready: records.length > 0 && score === 1, evidenceIds: records.map(record => record.evidenceId) };
        };
        const technical = dimension("TECHNICAL");
        const governance = dimension("GOVERNANCE");
        const operational = dimension("OPERATIONAL");
        return {
            systemId, technical, governance, operational,
            ready: technical.ready && governance.ready && operational.ready,
            evaluatedAt: new Date()
        };
    }
}
