import { randomUUID } from "crypto";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { RepositoryInspection, RepositoryReference } from "../../platform";
import { MissionExecutionContext } from "../../production-runtime";
import { CertifiedPlatform, EcosystemSystemCandidate, PlatformReadinessDomain } from "../contracts";
import { ecosystemIsolationExecutor } from "../ecosystem-isolation-executor";
import { ecosystemCandidateDigest } from "../ecosystem-platform-evidence-executor";
import { MultiPlatformCertificationEngine } from "../multi-platform-certification-engine";

const platforms: CertifiedPlatform[] = ["WEB", "IOS", "ANDROID"];
const domains: PlatformReadinessDomain[] = ["PRIVACY", "IDENTITY", "AUTHORITY", "PROVENANCE", "ACCESSIBILITY", "SECURITY", "OPERATIONAL", "COMMERCIAL"];
const revisions = { "sgwalton87/playbook-platform": "a".repeat(40),
    "vycoywalton/bulletproof-beneficiary-registry": "b".repeat(40) } as const;

function candidate(name: "PLAYBOOK" | "BULLETPROOF"): EcosystemSystemCandidate {
    const repository = name === "PLAYBOOK" ? "sgwalton87/playbook-platform" : "vycoywalton/bulletproof-beneficiary-registry";
    return { systemId: `${name}-SYSTEM-001`, applicationId: `${name}-APPLICATION-001`, repository,
        revision: revisions[repository], brandId: `${name}-BRAND-001`, dataOwnershipBoundary: `${name}-DATA-001`,
        releaseAuthority: `${name}-RELEASE-AUTHORITY`, pbosContractVersion: "1.0.0",
        evidence: platforms.flatMap(platform => domains.map(domain => ({ evidenceId: `${name}-${platform}-${domain}`,
            platform, domain, valid: true, reference: `evidence://${name}/${platform}/${domain}`,
            provenance: ["PBOS-GENESIS", `${name}-APPLICATION-001`, revisions[repository]] }))),
        approvalIds: { WEB: `${name}-WEB-APPROVAL`, IOS: `${name}-IOS-APPROVAL`, ANDROID: `${name}-ANDROID-APPROVAL` },
        approvalIssuers: { WEB: "PBOS-HUMAN-GOVERNANCE", IOS: "PBOS-HUMAN-GOVERNANCE", ANDROID: "PBOS-HUMAN-GOVERNANCE" },
        externalReviewOutcomes: { APPLE: undefined, GOOGLE: undefined } };
}

function stateWithPlatformEvidence(candidates: readonly EcosystemSystemCandidate[]): GenesisStateRepository {
    const state = new GenesisStateRepository(join("/tmp", `pbos-050-isolation-${randomUUID()}.json`));
    const report = new MultiPlatformCertificationEngine().evaluate(candidates);
    state.appendAudit({ eventId: "platform-evidence-event", type: "CIP_050_PLATFORM_EVIDENCE_COMPILED",
        actorId: "operator-1", resource: "platform-run", occurredAt: "2026-08-06T12:00:00.000Z",
        evidence: { missionId: "050-platform-evidence", report, candidateDigest: ecosystemCandidateDigest(candidates) } });
    return state;
}

function context(): MissionExecutionContext {
    return { mission: { missionId: "050-isolation", systemId: "PLAYBOOK-SYSTEM-001",
        title: "Prove shared PBOS contracts and independent ownership", rationale: "platform evidence complete",
        dependencies: ["050-platform-evidence"], approvalRequired: true, status: "ACTIVE", evidenceIds: [],
        completionPolicy: { kind: "PLATFORM_ARTIFACT", requiredDimensions: [], acceptanceCriteria: [] } },
    run: { runId: "isolation-run", runType: "READINESS", triggerSource: "CLI", actorId: "operator-1",
        authorizationArtifactId: "approval-1", repositoryContextId: "repository-context", runtimeContextId: "runtime-context",
        systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform", startingBranch: "main",
        startingCommit: revisions["sgwalton87/playbook-platform"], currentBranch: "main",
        currentCommit: revisions["sgwalton87/playbook-platform"], requestedObjective: "CIP-050", selectedMission: "CIP-050 isolation",
        selectionRationale: "platform evidence complete", dependencySnapshot: [], status: "RUNNING",
        startedAt: new Date().toISOString(), lastHeartbeatAt: new Date().toISOString(), stageIds: [], retryCount: 0,
        repairAttempts: 0, filesAdded: [], filesModified: [], filesDeleted: [], commandsExecuted: [], testsExecuted: [],
        validationResults: [], previewArtifactIds: [], evidenceIds: [], acceptanceEvidence: [], blockers: [],
        autonomousContinuation: true }, report: () => undefined };
}

function inspection(reference: RepositoryReference): RepositoryInspection {
    const repository = `${reference.owner}/${reference.name}` as keyof typeof revisions;
    return { repository: reference, revision: revisions[repository], findings: ["WORKTREE_CLEAN"],
        files: ["PBOS.yaml"], inspectedAt: new Date() };
}

describe("CIP-050 ecosystem isolation execution adapter", () => {
    it("binds distinct ownership boundaries to the prior exact candidate digest", async () => {
        const candidates = [candidate("PLAYBOOK"), candidate("BULLETPROOF")];
        const state = stateWithPlatformEvidence(candidates);
        const result = await ecosystemIsolationExecutor({ state, loadCandidates: () => candidates,
            gateway: { inspectRepository: async reference => inspection(reference) },
            now: () => new Date("2026-08-06T13:00:00.000Z") })(context());
        expect(result.outputs).toMatchObject({ state: "READY_FOR_HUMAN_VALIDATION", sharedContractVersion: "1.0.0",
            boundaryChecks: { separateRepositories: true, separateBrands: true,
                separateDataOwnership: true, separateReleaseAuthorities: true } });
        expect(state.audit().at(-1)).toMatchObject({ type: "CIP_050_ISOLATION_PROVEN", resource: "isolation-run",
            evidence: { platformEvidenceEventId: "platform-evidence-event", state: "READY_FOR_HUMAN_VALIDATION" } });
    });

    it("rejects candidate drift after platform evidence compilation", async () => {
        const candidates = [candidate("PLAYBOOK"), candidate("BULLETPROOF")];
        const state = stateWithPlatformEvidence(candidates);
        const changed = [{ ...candidates[0], releaseAuthority: "CHANGED-AUTHORITY" }, candidates[1]];
        const executor = ecosystemIsolationExecutor({ state, loadCandidates: () => changed,
            gateway: { inspectRepository: async reference => inspection(reference) } });
        await expect(executor(context())).rejects.toThrow("changed after platform compilation");
        expect(state.audit().filter(item => item.type === "CIP_050_ISOLATION_PROVEN")).toHaveLength(0);
    });

    it("rejects governed repository movement before recording isolation", async () => {
        const candidates = [candidate("PLAYBOOK"), candidate("BULLETPROOF")];
        const state = stateWithPlatformEvidence(candidates);
        const executor = ecosystemIsolationExecutor({ state, loadCandidates: () => candidates,
            gateway: { inspectRepository: async reference => ({ ...inspection(reference), revision: "c".repeat(40) }) } });
        await expect(executor(context())).rejects.toThrow("lineage moved");
        expect(state.audit().filter(item => item.type === "CIP_050_ISOLATION_PROVEN")).toHaveLength(0);
    });
});
