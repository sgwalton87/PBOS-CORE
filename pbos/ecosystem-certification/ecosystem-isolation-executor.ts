import { randomUUID } from "crypto";
import { GenesisAuditEvent, GenesisStateRepository } from "../genesis-state";
import { governedBuildReference, GitHubRepositoryGateway, RepositoryInspection } from "../platform";
import { ProductionMissionExecutor } from "../production-runtime";
import { EcosystemSystemCandidate, MultiPlatformEcosystemReport } from "./contracts";
import { ecosystemCandidateDigest, loadEcosystemCandidates } from "./ecosystem-platform-evidence-executor";
import { MultiPlatformCertificationEngine } from "./multi-platform-certification-engine";

const PLAYBOOK_SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const PLAYBOOK_REPOSITORY = "sgwalton87/playbook-platform";
const BULLETPROOF_SYSTEM_ID = "BULLETPROOF-SYSTEM-001";
const BULLETPROOF_REPOSITORY = "vycoywalton/bulletproof-beneficiary-registry";

export interface EcosystemIsolationExecutorDependencies {
    readonly gateway: Pick<GitHubRepositoryGateway, "inspectRepository">;
    readonly state: GenesisStateRepository;
    readonly loadCandidates?: () => readonly EcosystemSystemCandidate[];
    readonly now?: () => Date;
}

interface PriorPlatformEvidence {
    readonly event: GenesisAuditEvent;
    readonly report: MultiPlatformEcosystemReport;
    readonly candidateDigest: string;
}

function priorPlatformEvidence(state: GenesisStateRepository): PriorPlatformEvidence {
    const event = [...state.audit()].reverse().find(item => item.type === "CIP_050_PLATFORM_EVIDENCE_COMPILED" &&
        item.evidence.missionId === "050-platform-evidence");
    const report = event?.evidence.report as MultiPlatformEcosystemReport | undefined;
    const candidateDigest = event?.evidence.candidateDigest;
    if (!event || !report || typeof candidateDigest !== "string" || report.status === "NOT_READY" || !report.independenceProven) {
        throw new Error("CIP-050 isolation requires a ready, durable platform-evidence report.");
    }
    return { event, report, candidateDigest };
}

function candidate(candidates: readonly EcosystemSystemCandidate[], systemId: string,
    repository: string): EcosystemSystemCandidate {
    const value = candidates.find(item => item.systemId === systemId);
    if (!value || value.repository !== repository) throw new Error(`CIP-050 isolation requires ${systemId} at ${repository}.`);
    return value;
}

async function inspect(dependencies: EcosystemIsolationExecutorDependencies,
    value: EcosystemSystemCandidate): Promise<RepositoryInspection> {
    const [owner, name] = value.repository.split("/");
    if (!owner || !name) throw new Error(`Invalid CIP-050 repository: ${value.repository}`);
    const result = await dependencies.gateway.inspectRepository(governedBuildReference({ owner, name, defaultBranch: "main" }, "main"));
    if (result.revision !== value.revision) {
        throw new Error(`CIP-050 isolation lineage moved for ${value.systemId}: candidate ${value.revision}, governed repository ${result.revision}.`);
    }
    return result;
}

function distinct(candidates: readonly EcosystemSystemCandidate[],
    select: (candidate: EcosystemSystemCandidate) => string): boolean {
    return new Set(candidates.map(select)).size === candidates.length;
}

export function ecosystemIsolationExecutor(
    dependencies: EcosystemIsolationExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "050-isolation" || context.run.systemId !== PLAYBOOK_SYSTEM_ID ||
            context.run.repository !== PLAYBOOK_REPOSITORY) {
            throw new Error("The CIP-050 isolation adapter is restricted to the governed ecosystem-isolation mission.");
        }
        const prior = priorPlatformEvidence(dependencies.state);
        const candidates = dependencies.loadCandidates?.() ?? loadEcosystemCandidates();
        if (ecosystemCandidateDigest(candidates) !== prior.candidateDigest) {
            throw new Error("CIP-050 candidate evidence changed after platform compilation; rerun 050-platform-evidence.");
        }
        const report = new MultiPlatformCertificationEngine().evaluate(candidates);
        if (report.status === "NOT_READY" || !report.independenceProven ||
            report.sharedContractVersion !== prior.report.sharedContractVersion) {
            throw new Error("CIP-050 isolation cannot validate a changed or incomplete platform report.");
        }
        const playbook = candidate(candidates, PLAYBOOK_SYSTEM_ID, PLAYBOOK_REPOSITORY);
        const bulletproof = candidate(candidates, BULLETPROOF_SYSTEM_ID, BULLETPROOF_REPOSITORY);
        const boundaryChecks = {
            sharedContractVersion: candidates.every(item => item.pbosContractVersion === report.sharedContractVersion),
            separateSystems: distinct(candidates, item => item.systemId),
            separateApplications: distinct(candidates, item => item.applicationId),
            separateRepositories: distinct(candidates, item => item.repository),
            separateBrands: distinct(candidates, item => item.brandId),
            separateDataOwnership: distinct(candidates, item => item.dataOwnershipBoundary),
            separateReleaseAuthorities: distinct(candidates, item => item.releaseAuthority)
        };
        const failed = Object.entries(boundaryChecks).filter(([, passed]) => !passed).map(([name]) => name);
        if (failed.length) throw new Error(`CIP-050 ownership isolation failed: ${failed.join(", ")}.`);
        context.report("DISCOVERY", "Rechecking both independently owned application repositories.");
        const [playbookInspection, bulletproofInspection] = await Promise.all([
            inspect(dependencies, playbook), inspect(dependencies, bulletproof)
        ]);
        if (playbookInspection.revision !== context.run.startingCommit) {
            throw new Error(`CIP-050 isolation Playbook lineage mismatch: run ${context.run.startingCommit}, governed repository ${playbookInspection.revision}.`);
        }
        const evidenceId = `ecosystem-isolation:${randomUUID()}`;
        const occurredAt = (dependencies.now?.() ?? new Date()).toISOString();
        dependencies.state.appendAudit({ eventId: randomUUID(), type: "CIP_050_ISOLATION_PROVEN",
            actorId: context.run.actorId, resource: context.run.runId, occurredAt,
            evidence: { missionId: context.mission.missionId, evidenceId, platformReportId: prior.report.reportId,
                platformEvidenceEventId: prior.event.eventId, candidateDigest: prior.candidateDigest,
                sharedContractVersion: report.sharedContractVersion, boundaryChecks,
                repositories: { [PLAYBOOK_REPOSITORY]: playbookInspection.revision,
                    [BULLETPROOF_REPOSITORY]: bulletproofInspection.revision },
                state: "READY_FOR_HUMAN_VALIDATION" } });
        return {
            outputs: { evidenceId, state: "READY_FOR_HUMAN_VALIDATION", platformReportId: prior.report.reportId,
                sharedContractVersion: report.sharedContractVersion, boundaryChecks },
            evidenceIds: [evidenceId, `ecosystem-report:${prior.report.reportId}`,
                `candidate-digest:${prior.candidateDigest}`,
                `repository:${PLAYBOOK_REPOSITORY}@${playbookInspection.revision}`,
                `repository:${BULLETPROOF_REPOSITORY}@${bulletproofInspection.revision}`],
            commands: [{ command: "prove shared PBOS contract and independent application ownership",
                exitCode: 0, durationMs: 0, output: `${evidenceId} READY_FOR_HUMAN_VALIDATION` }],
            validations: [
                { name: "Both applications use one PBOS contract version", passed: true, durationMs: 0,
                    evidenceId: `contract:${report.sharedContractVersion}` },
                { name: "System, repository, brand, data, and release ownership remain independent", passed: true,
                    durationMs: 0, evidenceId },
                { name: "Both governed repository revisions match compiled platform evidence", passed: true,
                    durationMs: 0, evidenceId: `candidate-digest:${prior.candidateDigest}` }
            ]
        };
    };
}
