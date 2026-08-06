import { ApplicationAcceptanceDimension, ApplicationAcceptanceEvidence, MissionQueueItem, ProductionRun } from "./contracts";

const sha = /^[a-f0-9]{7,40}$/i;
const executableSources: Readonly<Record<ApplicationAcceptanceDimension, readonly ApplicationAcceptanceEvidence["source"][]>> = {
    ROUTE: ["RUNTIME_PROBE", "BROWSER_JOURNEY"],
    USER_INTERFACE: ["BROWSER_JOURNEY"],
    DURABLE_DATA: ["RUNTIME_PROBE", "BROWSER_JOURNEY"],
    AUTHORITY: ["RUNTIME_PROBE", "BROWSER_JOURNEY", "SECURITY_TEST"],
    PBOS_INTEGRATION: ["RUNTIME_PROBE", "BROWSER_JOURNEY"],
    ACCEPTANCE_TEST: ["BROWSER_JOURNEY"],
    ACCESSIBILITY: ["ACCESSIBILITY_AUDIT"],
    SECURITY: ["RUNTIME_PROBE", "BROWSER_JOURNEY", "SECURITY_TEST"],
    INDEPENDENT_VALIDATION: ["CI_VALIDATION"],
    PREVIEW: ["PREVIEW_PROBE"]
};

export class FunctionalAcceptanceVerifier {
    assertImplementationEvidence(mission: MissionQueueItem, evidence: readonly ApplicationAcceptanceEvidence[],
        repository: string, commit: string): void {
        if (mission.completionPolicy?.kind !== "FUNCTIONAL_APPLICATION") return;
        this.assertEvidenceShape(evidence, repository, commit);
        const required = mission.completionPolicy.requiredDimensions.filter(item => item !== "INDEPENDENT_VALIDATION");
        const missing = this.missing(required, evidence);
        if (missing.length) throw new Error(`Functional mission ${mission.missionId} is missing implementation acceptance evidence: ${missing.join(", ")}.`);
    }

    assertCertificationEvidence(mission: MissionQueueItem, run: ProductionRun): void {
        if (mission.completionPolicy?.kind !== "FUNCTIONAL_APPLICATION") return;
        const evidence = run.acceptanceEvidence ?? [];
        this.assertEvidenceShape(evidence, run.repository, run.currentCommit);
        const missing = this.missingExecutable(mission.completionPolicy.requiredDimensions, evidence);
        if (missing.length) throw new Error(`Functional mission ${mission.missionId} cannot be certified; missing acceptance evidence: ${missing.join(", ")}.`);
        if (!run.previewArtifactIds.length && mission.completionPolicy.requiredDimensions.includes("PREVIEW")) {
            throw new Error(`Functional mission ${mission.missionId} cannot be certified without a commit-bound preview.`);
        }
    }

    private assertEvidenceShape(evidence: readonly ApplicationAcceptanceEvidence[], repository: string, commit: string): void {
        if (!sha.test(commit)) throw new Error("Functional acceptance requires an exact application commit.");
        const invalid = evidence.find(item => !item.evidenceId || !item.behavior.trim() || !item.artifact.trim() || !item.passed ||
            item.repository !== repository || item.commit !== commit);
        if (invalid) throw new Error(`Functional acceptance evidence ${invalid.evidenceId || "UNKNOWN"} is invalid or not bound to the exact application commit.`);
    }

    private missing(required: readonly ApplicationAcceptanceDimension[], evidence: readonly ApplicationAcceptanceEvidence[]): ApplicationAcceptanceDimension[] {
        const present = new Set(evidence.filter(item => item.passed).map(item => item.dimension));
        return required.filter(item => !present.has(item));
    }

    private missingExecutable(required: readonly ApplicationAcceptanceDimension[],
        evidence: readonly ApplicationAcceptanceEvidence[]): ApplicationAcceptanceDimension[] {
        return required.filter(dimension => !evidence.some(item => item.dimension === dimension && item.passed &&
            executableSources[dimension].includes(item.source)));
    }
}
