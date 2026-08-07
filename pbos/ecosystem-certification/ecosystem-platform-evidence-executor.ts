import { createHash, randomUUID } from "crypto";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { GenesisStateRepository } from "../genesis-state";
import { governedBuildReference, GitHubRepositoryGateway, RepositoryInspection } from "../platform";
import { ProductionMissionExecutor } from "../production-runtime";
import { EcosystemSystemCandidate, MultiPlatformEcosystemReport } from "./contracts";
import { MultiPlatformCertificationEngine } from "./multi-platform-certification-engine";

const PLAYBOOK_SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const PLAYBOOK_REPOSITORY = "sgwalton87/playbook-platform";
const BULLETPROOF_SYSTEM_ID = "BULLETPROOF-SYSTEM-001";
const BULLETPROOF_REPOSITORY = "vycoywalton/bulletproof-beneficiary-registry";

export function ecosystemCandidatePath(environment: NodeJS.ProcessEnv = process.env,
    stateHome = environment.PBOS_STATE_HOME ?? join(homedir(), ".pbos")): string {
    return environment.PBOS_ECOSYSTEM_CERTIFICATION_PATH?.trim() ||
        join(stateHome, "evidence", "cip-050-candidates.json");
}

export function loadEcosystemCandidates(path = ecosystemCandidatePath()): readonly EcosystemSystemCandidate[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") throw new Error(`CIP-050 candidate evidence file is missing: ${path}`);
        throw new Error(`CIP-050 candidate evidence file is unreadable: ${path}`);
    }
    if (!Array.isArray(parsed)) throw new Error("CIP-050 candidate evidence must be a JSON array.");
    return parsed as EcosystemSystemCandidate[];
}

export function ecosystemCandidateDigest(candidates: readonly EcosystemSystemCandidate[]): string {
    return createHash("sha256").update(JSON.stringify(candidates)).digest("hex");
}

export interface EcosystemEvidenceReadiness {
    readonly ready: boolean;
    readonly path: string;
    readonly status?: MultiPlatformEcosystemReport["status"];
    readonly reason?: string;
}

export function inspectEcosystemEvidenceReadiness(environment: NodeJS.ProcessEnv = process.env,
    stateHome = environment.PBOS_STATE_HOME ?? join(homedir(), ".pbos")): EcosystemEvidenceReadiness {
    const path = ecosystemCandidatePath(environment, stateHome);
    try {
        const report = new MultiPlatformCertificationEngine().evaluate(loadEcosystemCandidates(path));
        return report.status === "NOT_READY"
            ? { ready: false, path, status: report.status,
                reason: "One or more platform scorecards, independent approvals, or ownership boundaries are incomplete." }
            : { ready: true, path, status: report.status };
    } catch (error) {
        return { ready: false, path, reason: error instanceof Error ? error.message : String(error) };
    }
}

export interface EcosystemPlatformEvidenceExecutorDependencies {
    readonly gateway: Pick<GitHubRepositoryGateway, "inspectRepository">;
    readonly state: GenesisStateRepository;
    readonly loadCandidates?: () => readonly EcosystemSystemCandidate[];
    readonly now?: () => Date;
}

function expectedCandidate(candidates: readonly EcosystemSystemCandidate[], systemId: string,
    repository: string): EcosystemSystemCandidate {
    const candidate = candidates.find(item => item.systemId === systemId);
    if (!candidate || candidate.repository !== repository) {
        throw new Error(`CIP-050 requires the canonical ${systemId} candidate at ${repository}.`);
    }
    return candidate;
}

async function inspectCandidate(dependencies: EcosystemPlatformEvidenceExecutorDependencies,
    candidate: EcosystemSystemCandidate): Promise<RepositoryInspection> {
    const [owner, name] = candidate.repository.split("/");
    if (!owner || !name) throw new Error(`Invalid CIP-050 repository: ${candidate.repository}`);
    const inspection = await dependencies.gateway.inspectRepository(governedBuildReference({ owner, name, defaultBranch: "main" }, "main"));
    if (inspection.revision !== candidate.revision) {
        throw new Error(`CIP-050 evidence for ${candidate.systemId} is stale: candidate ${candidate.revision}, governed repository ${inspection.revision}.`);
    }
    return inspection;
}

export function ecosystemPlatformEvidenceExecutor(
    dependencies: EcosystemPlatformEvidenceExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "050-platform-evidence" || context.run.systemId !== PLAYBOOK_SYSTEM_ID ||
            context.run.repository !== PLAYBOOK_REPOSITORY) {
            throw new Error("The CIP-050 platform-evidence adapter is restricted to the governed Playbook ecosystem mission.");
        }
        const candidates = dependencies.loadCandidates?.() ?? loadEcosystemCandidates();
        const playbook = expectedCandidate(candidates, PLAYBOOK_SYSTEM_ID, PLAYBOOK_REPOSITORY);
        const bulletproof = expectedCandidate(candidates, BULLETPROOF_SYSTEM_ID, BULLETPROOF_REPOSITORY);
        const report = new MultiPlatformCertificationEngine().evaluate(candidates);
        if (!report.independenceProven || report.status === "NOT_READY") {
            const missing = report.systems.flatMap(system => system.platforms
                .filter(platform => !platform.ready)
                .map(platform => `${system.systemId}:${platform.platform}:${platform.missingDomains.join("|") || "INDEPENDENT_APPROVAL"}`));
            throw new Error(`CIP-050 platform evidence is incomplete${missing.length ? `: ${missing.join(", ")}` : "."}`);
        }
        context.report("DISCOVERY", "Inspecting independent Playbook and Bulletproof governed revisions.");
        const [playbookInspection, bulletproofInspection] = await Promise.all([
            inspectCandidate(dependencies, playbook), inspectCandidate(dependencies, bulletproof)
        ]);
        if (playbookInspection.revision !== context.run.startingCommit) {
            throw new Error(`CIP-050 Playbook lineage mismatch: run ${context.run.startingCommit}, governed repository ${playbookInspection.revision}.`);
        }
        const occurredAt = (dependencies.now?.() ?? new Date()).toISOString();
        const candidateDigest = ecosystemCandidateDigest(candidates);
        const candidateBoundaries = candidates.map(candidate => ({ systemId: candidate.systemId,
            applicationId: candidate.applicationId, repository: candidate.repository, revision: candidate.revision,
            brandId: candidate.brandId, dataOwnershipBoundary: candidate.dataOwnershipBoundary,
            releaseAuthority: candidate.releaseAuthority, pbosContractVersion: candidate.pbosContractVersion }));
        dependencies.state.appendAudit({ eventId: randomUUID(), type: "CIP_050_PLATFORM_EVIDENCE_COMPILED",
            actorId: context.run.actorId, resource: context.run.runId, occurredAt,
            evidence: { missionId: context.mission.missionId, report, candidateDigest, candidateBoundaries,
                repositoryRevisions: { [PLAYBOOK_REPOSITORY]: playbookInspection.revision,
                    [BULLETPROOF_REPOSITORY]: bulletproofInspection.revision } } });
        const evidenceIds = [...new Set([`ecosystem-report:${report.reportId}`,
            `repository:${PLAYBOOK_REPOSITORY}@${playbookInspection.revision}`,
            `repository:${BULLETPROOF_REPOSITORY}@${bulletproofInspection.revision}`,
            ...candidates.flatMap(candidate => candidate.evidence.map(item => item.evidenceId)),
            ...candidates.flatMap(candidate => Object.values(candidate.approvalIds)
                .filter((value): value is string => Boolean(value)))])];
        return {
            outputs: { reportId: report.reportId, candidateDigest, status: report.status, independenceProven: report.independenceProven,
                sharedContractVersion: report.sharedContractVersion,
                systems: report.systems.map(system => ({ systemId: system.systemId, status: system.status,
                    platforms: system.platforms.map(platform => ({ platform: platform.platform, ready: platform.ready,
                        score: platform.score })) })) },
            evidenceIds,
            commands: [{ command: "compile independent multi-platform ecosystem evidence", exitCode: 0,
                durationMs: 0, output: `${report.reportId} ${report.status}` }],
            validations: [
                { name: "Playbook exact-revision platform scorecard verified", passed: true, durationMs: 0,
                    evidenceId: `repository:${PLAYBOOK_REPOSITORY}@${playbookInspection.revision}` },
                { name: "Bulletproof exact-revision platform scorecard verified", passed: true, durationMs: 0,
                    evidenceId: `repository:${BULLETPROOF_REPOSITORY}@${bulletproofInspection.revision}` },
                { name: "Independent provenance-bearing web, iOS, and Android evidence compiled", passed: true,
                    durationMs: 0, evidenceId: `ecosystem-report:${report.reportId}` }
            ]
        };
    };
}
