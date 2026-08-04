import { CertificationDomain } from "./evidence-registry";
import { SystemReadiness } from "./system-readiness";

export type EcosystemCertificationState = "NOT_READY" | "READY_FOR_CERTIFICATION" | "CERTIFIED";

export interface EcosystemScorecard {
    readonly systemId: string;
    readonly systemMaturity: number;
    readonly integrationMaturity: number;
    readonly passedDomains: readonly CertificationDomain[];
    readonly failedDomains: readonly CertificationDomain[];
    readonly certificationState: EcosystemCertificationState;
    readonly measuredAt: Date;
}

export class EcosystemScorecardEngine {
    calculate(
        systemId: string,
        readiness: SystemReadiness,
        domainResults: Readonly<Record<CertificationDomain, boolean>>,
        formallyCertified = false
    ): EcosystemScorecard {
        const entries = Object.entries(domainResults) as [CertificationDomain, boolean][];
        const passedDomains = entries.filter(([, passed]) => passed).map(([domain]) => domain);
        const failedDomains = entries.filter(([, passed]) => !passed).map(([domain]) => domain);
        const systemMaturity = entries.length === 0 ? 0 : passedDomains.length / entries.length;
        const integrationMaturity = domainResults.EXTERNAL_INTEGRATION ? 1 : 0;
        const ready = readiness.ready && failedDomains.length === 0;
        return {
            systemId, systemMaturity, integrationMaturity, passedDomains, failedDomains,
            certificationState: formallyCertified && ready ? "CERTIFIED" : ready ? "READY_FOR_CERTIFICATION" : "NOT_READY",
            measuredAt: new Date()
        };
    }
}
