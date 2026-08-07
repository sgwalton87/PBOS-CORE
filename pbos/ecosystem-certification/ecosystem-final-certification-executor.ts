import { randomUUID } from "crypto";
import { GenesisAuditEvent, GenesisStateRepository, VerifiableApproval } from "../genesis-state";
import { governedBuildReference, GitHubRepositoryGateway, RepositoryInspection } from "../platform";
import { ProductionMissionExecutor, ProductionRuntimeService } from "../production-runtime";
import { CertifiedPlatform, EcosystemSystemCandidate } from "./contracts";
import { ecosystemCandidateDigest, loadEcosystemCandidates } from "./ecosystem-platform-evidence-executor";
import { MultiPlatformCertificationEngine } from "./multi-platform-certification-engine";

const PLAYBOOK_SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const PLAYBOOK_REPOSITORY = "sgwalton87/playbook-platform";
const REQUIRED_SYSTEMS = [PLAYBOOK_SYSTEM_ID, "BULLETPROOF-SYSTEM-001"] as const;
export const ECOSYSTEM_CERTIFICATION_PLATFORMS: readonly CertifiedPlatform[] = ["WEB", "IOS", "ANDROID"];
export const ecosystemSystemCertificationResource = (systemId: string): string => `ecosystem-system:${systemId}`;
export const ecosystemPlatformCertificationResource = (systemId: string, platform: CertifiedPlatform): string =>
    `ecosystem-platform:${systemId}:${platform}`;

export interface EcosystemFinalCertificationExecutorDependencies {
    readonly gateway: Pick<GitHubRepositoryGateway, "inspectRepository">;
    readonly state: GenesisStateRepository;
    readonly verifyApproval: (approval: VerifiableApproval, action: string, resource: string) => boolean;
    readonly loadCandidates?: () => readonly EcosystemSystemCandidate[];
    readonly now?: () => Date;
}

export interface EcosystemFinalCertificationReadiness {
    readonly ready: boolean;
    readonly missing: readonly string[];
}

type ApprovalEvidenceDependencies = Pick<EcosystemFinalCertificationExecutorDependencies, "state" | "verifyApproval">;

function verifiableApproval(dependencies: ApprovalEvidenceDependencies, action: string,
    resource: string): VerifiableApproval {
    const event = [...dependencies.state.audit()].reverse().find(item => item.type === "VERIFIABLE_APPROVAL" &&
        item.resource === resource && item.evidence.purpose === action);
    const approval = event?.evidence.approval as VerifiableApproval | undefined;
    if (!approval || approval.approvalId !== event?.eventId ||
        !dependencies.verifyApproval(approval, action, resource)) {
        throw new Error(`CIP-050 requires a current verifiable ${action} approval for ${resource}.`);
    }
    return approval;
}

function priorIsolation(dependencies: ApprovalEvidenceDependencies): {
    readonly event: GenesisAuditEvent; readonly candidateDigest: string; readonly approval: VerifiableApproval;
} {
    const event = [...dependencies.state.audit()].reverse().find(item => item.type === "CIP_050_ISOLATION_PROVEN" &&
        item.evidence.missionId === "050-isolation");
    const candidateDigest = event?.evidence.candidateDigest;
    const run = event ? dependencies.state.productionRun(event.resource) : undefined;
    if (!event || typeof candidateDigest !== "string" || !run || run.status !== "CERTIFIED") {
        throw new Error("CIP-050 final certification requires certified, durable ecosystem-isolation evidence.");
    }
    return { event, candidateDigest,
        approval: verifiableApproval(dependencies, "CERTIFY_PRODUCTION_MISSION", run.runId) };
}

async function inspect(dependencies: EcosystemFinalCertificationExecutorDependencies,
    candidate: EcosystemSystemCandidate): Promise<RepositoryInspection> {
    const [owner, name] = candidate.repository.split("/");
    if (!owner || !name) throw new Error(`Invalid CIP-050 repository: ${candidate.repository}`);
    const result = await dependencies.gateway.inspectRepository(governedBuildReference({ owner, name, defaultBranch: "main" }, "main"));
    if (result.revision !== candidate.revision) {
        throw new Error(`CIP-050 final certification lineage moved for ${candidate.systemId}: candidate ${candidate.revision}, governed repository ${result.revision}.`);
    }
    return result;
}

function issuer(approval: VerifiableApproval): string {
    return `PBOS:${approval.organizationId}:${approval.operatorId}`;
}

export function inspectEcosystemFinalCertificationReadiness(
    dependencies: Pick<EcosystemFinalCertificationExecutorDependencies, "state" | "verifyApproval" | "loadCandidates">
): EcosystemFinalCertificationReadiness {
    const missing: string[] = [];
    let digest: string | undefined;
    try { digest = priorIsolation(dependencies).candidateDigest; }
    catch (error) { missing.push(error instanceof Error ? error.message : String(error)); }
    let candidates: readonly EcosystemSystemCandidate[] = [];
    try { candidates = dependencies.loadCandidates?.() ?? loadEcosystemCandidates(); }
    catch (error) { missing.push(error instanceof Error ? error.message : String(error)); }
    if (digest && candidates.length && ecosystemCandidateDigest(candidates) !== digest) {
        missing.push("CIP-050 candidate evidence changed after certified isolation.");
    }
    const previews = new ProductionRuntimeService(dependencies.state).applicationDeliveryProofs();
    candidates.forEach(candidate => {
        const preview = previews.find(item => item.systemId === candidate.systemId &&
            item.repository === candidate.repository && item.commit === candidate.revision);
        if (!preview?.webUrl || !preview.mobileUrl) {
            missing.push(`${candidate.systemId} requires exact-revision desktop web and mobile preview URLs.`);
        }
    });
    return { ready: missing.length === 0, missing };
}

export function ecosystemFinalCertificationExecutor(
    dependencies: EcosystemFinalCertificationExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "050-certification" || context.run.systemId !== PLAYBOOK_SYSTEM_ID ||
            context.run.repository !== PLAYBOOK_REPOSITORY) {
            throw new Error("The CIP-050 final-certification adapter is restricted to the governed ecosystem mission.");
        }
        const prior = priorIsolation(dependencies);
        const sourceCandidates = dependencies.loadCandidates?.() ?? loadEcosystemCandidates();
        if (ecosystemCandidateDigest(sourceCandidates) !== prior.candidateDigest) {
            throw new Error("CIP-050 candidate evidence changed after isolation; rerun platform evidence and isolation.");
        }
        const candidates = sourceCandidates.map(candidate => {
            const systemApproval = verifiableApproval(dependencies, "CERTIFY_ECOSYSTEM_SYSTEM",
                ecosystemSystemCertificationResource(candidate.systemId));
            const platformApprovals = Object.fromEntries(ECOSYSTEM_CERTIFICATION_PLATFORMS.map(platform => {
                const approval = verifiableApproval(dependencies, "CERTIFY_ECOSYSTEM_PLATFORM",
                    ecosystemPlatformCertificationResource(candidate.systemId, platform));
                return [platform, approval];
            })) as Record<CertifiedPlatform, VerifiableApproval>;
            return { ...candidate,
                approvalIds: Object.fromEntries(ECOSYSTEM_CERTIFICATION_PLATFORMS.map(platform =>
                    [platform, platformApprovals[platform].approvalId])) as Record<CertifiedPlatform, string>,
                approvalIssuers: Object.fromEntries(ECOSYSTEM_CERTIFICATION_PLATFORMS.map(platform =>
                    [platform, issuer(platformApprovals[platform])])) as Record<CertifiedPlatform, string>,
                humanCertificationId: systemApproval.approvalId,
                humanCertificationIssuer: issuer(systemApproval) };
        });
        if (candidates.length !== REQUIRED_SYSTEMS.length ||
            REQUIRED_SYSTEMS.some(systemId => !candidates.some(candidate => candidate.systemId === systemId))) {
            throw new Error("CIP-050 final certification requires both canonical reference systems.");
        }
        const previews = new ProductionRuntimeService(dependencies.state).applicationDeliveryProofs();
        candidates.forEach(candidate => {
            const preview = previews.find(item => item.systemId === candidate.systemId &&
                item.repository === candidate.repository && item.commit === candidate.revision);
            if (!preview?.webUrl || !preview.mobileUrl) {
                throw new Error(`CIP-050 requires exact-revision desktop web and mobile preview URLs for ${candidate.systemId}.`);
            }
        });
        context.report("DISCOVERY", "Rechecking both exact revisions and independent application preview surfaces.");
        const inspections = await Promise.all(candidates.map(candidate => inspect(dependencies, candidate)));
        const playbook = candidates.find(candidate => candidate.systemId === PLAYBOOK_SYSTEM_ID)!;
        if (playbook.revision !== context.run.startingCommit) {
            throw new Error(`CIP-050 final Playbook lineage mismatch: run ${context.run.startingCommit}, candidate ${playbook.revision}.`);
        }
        const report = new MultiPlatformCertificationEngine().evaluate(candidates);
        if (report.status !== "CERTIFIED" || !report.independenceProven) {
            throw new Error("CIP-050 final ecosystem certification did not reach independently certified state.");
        }
        const occurredAt = (dependencies.now?.() ?? new Date()).toISOString();
        const evidenceId = `ecosystem-certification:${report.reportId}`;
        dependencies.state.appendAudit({ eventId: randomUUID(), type: "CIP_050_ECOSYSTEM_CERTIFIED",
            actorId: context.run.actorId, resource: context.run.runId, occurredAt,
            evidence: { missionId: context.mission.missionId, evidenceId, report,
                isolationEventId: prior.event.eventId, isolationApprovalId: prior.approval.approvalId,
                candidateDigest: prior.candidateDigest,
                previews: previews.filter(preview => REQUIRED_SYSTEMS.includes(preview.systemId as typeof REQUIRED_SYSTEMS[number])),
                repositories: Object.fromEntries(inspections.map(inspection =>
                    [`${inspection.repository.owner}/${inspection.repository.name}`, inspection.revision])) } });
        const approvalIds = candidates.flatMap(candidate => [candidate.humanCertificationId!,
            ...Object.values(candidate.approvalIds).filter((value): value is string => Boolean(value))]);
        return { outputs: { evidenceId, reportId: report.reportId, status: report.status,
                systems: report.systems.map(system => ({ systemId: system.systemId, status: system.status })) },
            evidenceIds: [evidenceId, `candidate-digest:${prior.candidateDigest}`,
                `isolation:${prior.event.eventId}`, ...approvalIds,
                ...previews.filter(preview => REQUIRED_SYSTEMS.includes(preview.systemId as typeof REQUIRED_SYSTEMS[number]))
                    .map(preview => `preview:${preview.runId}@${preview.commit}`)],
            commands: [{ command: "issue independent multi-platform ecosystem certification", exitCode: 0,
                durationMs: 0, output: `${report.reportId} CERTIFIED` }],
            validations: [
                { name: "The Playbook desktop and mobile launch surfaces are exact-revision ready", passed: true,
                    durationMs: 0, evidenceId: `preview:${PLAYBOOK_SYSTEM_ID}` },
                { name: "Bulletproof desktop and mobile launch surfaces are exact-revision ready", passed: true,
                    durationMs: 0, evidenceId: "preview:BULLETPROOF-SYSTEM-001" },
                { name: "Separate system and web, iOS, and Android approvals are verifiable", passed: true,
                    durationMs: 0, evidenceId }
            ] };
    };
}
