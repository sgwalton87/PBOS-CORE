import { randomUUID } from "crypto";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository } from "../../genesis-state";
import { RepositoryInspection, RepositoryReference } from "../../platform";
import { MissionExecutionContext } from "../../production-runtime";
import { CertifiedPlatform, EcosystemSystemCandidate, PlatformReadinessDomain } from "../contracts";
import { ecosystemPlatformEvidenceExecutor } from "../ecosystem-platform-evidence-executor";

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

function context(): MissionExecutionContext {
    return { mission: { missionId: "050-platform-evidence", systemId: "PLAYBOOK-SYSTEM-001",
        title: "Compile independent multi-platform ecosystem evidence", rationale: "dependencies complete",
        dependencies: ["048-web-staging", "049-certification"], approvalRequired: false,
        status: "ELIGIBLE", evidenceIds: [] },
    run: { runId: "run-050", runType: "READINESS", triggerSource: "CLI", actorId: "operator-1",
        authorizationArtifactId: "approval-1", repositoryContextId: "repository-context", runtimeContextId: "runtime-context",
        systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform", startingBranch: "main",
        startingCommit: revisions["sgwalton87/playbook-platform"], currentBranch: "main",
        currentCommit: revisions["sgwalton87/playbook-platform"], requestedObjective: "CIP-050", selectedMission: "CIP-050",
        selectionRationale: "dependencies complete", dependencySnapshot: [], status: "RUNNING", startedAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(), stageIds: [], retryCount: 0, repairAttempts: 0, filesAdded: [],
        filesModified: [], filesDeleted: [], commandsExecuted: [], testsExecuted: [], validationResults: [],
        previewArtifactIds: [], evidenceIds: [], acceptanceEvidence: [], blockers: [], autonomousContinuation: true },
    report: () => undefined };
}

function inspection(reference: RepositoryReference): RepositoryInspection {
    const repository = `${reference.owner}/${reference.name}` as keyof typeof revisions;
    return { repository: reference, revision: revisions[repository], findings: ["WORKTREE_CLEAN"],
        files: ["package.json"], inspectedAt: new Date() };
}

describe("CIP-050 platform evidence execution adapter", () => {
    it("persists a ready two-system report only after exact-revision inspections", async () => {
        const state = new GenesisStateRepository(join("/tmp", `pbos-050-${randomUUID()}.json`));
        const result = await ecosystemPlatformEvidenceExecutor({ state, loadCandidates: () => [candidate("PLAYBOOK"), candidate("BULLETPROOF")],
            gateway: { inspectRepository: async reference => inspection(reference) },
            now: () => new Date("2026-08-06T12:00:00.000Z") })(context());
        expect(result.outputs).toMatchObject({ status: "READY_FOR_HUMAN_CERTIFICATION", independenceProven: true,
            sharedContractVersion: "1.0.0" });
        expect(result.validations).toHaveLength(3);
        expect(state.audit()).toHaveLength(1);
        expect(state.audit()[0]).toMatchObject({ type: "CIP_050_PLATFORM_EVIDENCE_COMPILED", resource: "run-050" });
    });

    it("fails closed without recording completion when one platform domain is missing", async () => {
        const state = new GenesisStateRepository(join("/tmp", `pbos-050-${randomUUID()}.json`));
        const bulletproof = candidate("BULLETPROOF");
        const incomplete = { ...bulletproof, evidence: bulletproof.evidence.filter(item =>
            !(item.platform === "ANDROID" && item.domain === "PRIVACY")) };
        const executor = ecosystemPlatformEvidenceExecutor({ state,
            loadCandidates: () => [candidate("PLAYBOOK"), incomplete],
            gateway: { inspectRepository: async reference => inspection(reference) } });
        await expect(executor(context())).rejects.toThrow("BULLETPROOF-SYSTEM-001:ANDROID:PRIVACY");
        expect(state.audit()).toHaveLength(0);
    });

    it("rejects stale repository lineage before persisting the report", async () => {
        const state = new GenesisStateRepository(join("/tmp", `pbos-050-${randomUUID()}.json`));
        const executor = ecosystemPlatformEvidenceExecutor({ state,
            loadCandidates: () => [candidate("PLAYBOOK"), candidate("BULLETPROOF")],
            gateway: { inspectRepository: async reference => ({ ...inspection(reference), revision: "c".repeat(40) }) } });
        await expect(executor(context())).rejects.toThrow("is stale");
        expect(state.audit()).toHaveLength(0);
    });
});
