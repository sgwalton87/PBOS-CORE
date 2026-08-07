import { randomUUID } from "crypto";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository, VerifiableApproval } from "../../genesis-state";
import { RepositoryInspection, RepositoryReference } from "../../platform";
import { MissionExecutionContext, ProductionRuntimeService } from "../../production-runtime";
import { CertifiedPlatform, EcosystemSystemCandidate, PlatformReadinessDomain } from "../contracts";
import { ecosystemFinalCertificationExecutor, ecosystemPlatformCertificationResource,
    ecosystemSystemCertificationResource } from "../ecosystem-final-certification-executor";
import { ecosystemCandidateDigest } from "../ecosystem-platform-evidence-executor";

const platforms: CertifiedPlatform[] = ["WEB", "IOS", "ANDROID"];
const domains: PlatformReadinessDomain[] = ["PRIVACY", "IDENTITY", "AUTHORITY", "PROVENANCE",
    "ACCESSIBILITY", "SECURITY", "OPERATIONAL", "COMMERCIAL"];
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
        approvalIds: { WEB: `${name}-SOURCE-WEB`, IOS: `${name}-SOURCE-IOS`, ANDROID: `${name}-SOURCE-ANDROID` },
        approvalIssuers: { WEB: "PBOS", IOS: "PBOS", ANDROID: "PBOS" },
        externalReviewOutcomes: { APPLE: undefined, GOOGLE: undefined } };
}

function approval(action: string, resource: string): VerifiableApproval {
    return { approvalId: randomUUID(), operatorId: "operator-1", organizationId: "PBOS-ORG-001",
        action, resource, issuedAt: "2026-08-06T12:00:00.000Z", expiresAt: "2026-08-07T12:00:00.000Z",
        signature: "verified-in-fixture" };
}

function appendApproval(state: GenesisStateRepository, action: string, resource: string): VerifiableApproval {
    const value = approval(action, resource);
    state.appendAudit({ eventId: value.approvalId, type: "VERIFIABLE_APPROVAL", actorId: value.operatorId,
        resource, occurredAt: value.issuedAt, evidence: { approval: value, purpose: action } });
    return value;
}

function setup(includeBulletproofMobile = true) {
    const candidates = [candidate("PLAYBOOK"), candidate("BULLETPROOF")];
    const state = new GenesisStateRepository(join("/tmp", `pbos-050-final-${randomUUID()}.json`));
    const runtime = new ProductionRuntimeService(state);
    state.saveSystem({ systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001",
        name: "The Playbook", domain: "Education", repository: candidates[0].repository,
        defaultBranch: "main", status: "READY", capabilities: [] });
    state.saveSystem({ systemId: "BULLETPROOF-SYSTEM-001", operatingSystemId: "BULLETPROOF-OS-001",
        name: "Bulletproof Beneficiary", domain: "Legacy Planning", repository: candidates[1].repository,
        defaultBranch: "main", status: "READY", capabilities: [] });
    const begin = (runId: string, systemId: string, repository: string, commit: string) => runtime.begin({ runId,
        systemId, actorId: "operator-1", authorizationArtifactId: "start-approval", repository,
        branch: "main", commit, objective: "CIP-050", mission: "Ecosystem evidence", rationale: "dependencies complete" });
    const isolation = begin("isolation-run", candidates[0].systemId, candidates[0].repository, candidates[0].revision);
    runtime.transition(isolation.runId, "QUEUED", "Queued");
    runtime.transition(isolation.runId, "STARTING", "Starting");
    runtime.transition(isolation.runId, "RUNNING", "Running");
    runtime.transition(isolation.runId, "VALIDATING", "Validating");
    runtime.transition(isolation.runId, "AWAITING_APPROVAL", "Validated");
    runtime.transition(isolation.runId, "CERTIFIED", "Certified");
    appendApproval(state, "CERTIFY_PRODUCTION_MISSION", isolation.runId);
    state.appendAudit({ eventId: "isolation-event", type: "CIP_050_ISOLATION_PROVEN", actorId: "operator-1",
        resource: isolation.runId, occurredAt: "2026-08-06T12:00:00.000Z",
        evidence: { missionId: "050-isolation", candidateDigest: ecosystemCandidateDigest(candidates) } });
    candidates.forEach((value, index) => {
        const run = begin(`${value.systemId}-preview`, value.systemId, value.repository, value.revision);
        runtime.recordPreview({ previewId: `${value.systemId}-preview`, runId: run.runId, repository: value.repository,
            branch: "main", commit: value.revision, status: "READY", webUrl: `https://${index}.example.com`,
            mobileUrl: index === 0 || includeBulletproofMobile ? `https://expo.dev/${index}` : undefined,
            routes: ["/"], personas: ["MEMBER"], viewports: ["DESKTOP_1440X900", "MOBILE_390X844"],
            screenshots: [], generatedAt: "2026-08-06T12:00:00.000Z", label: "LIVE" });
        state.saveProductionRun({ ...state.productionRun(run.runId)!, status: "CERTIFIED" });
        appendApproval(state, "CERTIFY_ECOSYSTEM_SYSTEM", ecosystemSystemCertificationResource(value.systemId));
        platforms.forEach(platform => appendApproval(state, "CERTIFY_ECOSYSTEM_PLATFORM",
            ecosystemPlatformCertificationResource(value.systemId, platform)));
    });
    return { candidates, state };
}

function context(): MissionExecutionContext {
    return { mission: { missionId: "050-certification", systemId: "PLAYBOOK-SYSTEM-001",
        title: "Issue separate human ecosystem certifications", rationale: "isolation certified",
        dependencies: ["050-isolation"], approvalRequired: true, status: "ACTIVE", evidenceIds: [],
        completionPolicy: { kind: "PLATFORM_ARTIFACT", requiredDimensions: [], acceptanceCriteria: [] } },
    run: { runId: "final-run", runType: "READINESS", triggerSource: "CLI", actorId: "operator-1",
        authorizationArtifactId: "approval-1", repositoryContextId: "repository-context", runtimeContextId: "runtime-context",
        systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform", startingBranch: "main",
        startingCommit: revisions["sgwalton87/playbook-platform"], currentBranch: "main",
        currentCommit: revisions["sgwalton87/playbook-platform"], requestedObjective: "CIP-050",
        selectedMission: "CIP-050 final certification", selectionRationale: "isolation certified",
        dependencySnapshot: [], status: "RUNNING", startedAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(), stageIds: [], retryCount: 0, repairAttempts: 0,
        filesAdded: [], filesModified: [], filesDeleted: [], commandsExecuted: [], testsExecuted: [],
        validationResults: [], previewArtifactIds: [], evidenceIds: [], acceptanceEvidence: [], blockers: [],
        autonomousContinuation: true }, report: () => undefined };
}

function inspection(reference: RepositoryReference): RepositoryInspection {
    const repository = `${reference.owner}/${reference.name}` as keyof typeof revisions;
    return { repository: reference, revision: revisions[repository], findings: ["WORKTREE_CLEAN"],
        files: ["PBOS.yaml"], inspectedAt: new Date() };
}

describe("CIP-050 final ecosystem certification adapter", () => {
    it("certifies two exact-revision applications with separate system and platform approvals", async () => {
        const { candidates, state } = setup();
        const result = await ecosystemFinalCertificationExecutor({ state, loadCandidates: () => candidates,
            gateway: { inspectRepository: async reference => inspection(reference) }, verifyApproval: () => true,
            now: () => new Date("2026-08-06T14:00:00.000Z") })(context());
        expect(result.outputs).toMatchObject({ status: "CERTIFIED", systems: [
            { systemId: "PLAYBOOK-SYSTEM-001", status: "CERTIFIED" },
            { systemId: "BULLETPROOF-SYSTEM-001", status: "CERTIFIED" }
        ] });
        expect(state.audit().at(-1)).toMatchObject({ type: "CIP_050_ECOSYSTEM_CERTIFIED",
            evidence: { isolationEventId: "isolation-event" } });
    });

    it("refuses final certification when either application lacks a real mobile launch surface", async () => {
        const { candidates, state } = setup(false);
        await expect(ecosystemFinalCertificationExecutor({ state, loadCandidates: () => candidates,
            gateway: { inspectRepository: async reference => inspection(reference) }, verifyApproval: () => true })(context()))
            .rejects.toThrow("desktop web and mobile preview URLs for BULLETPROOF-SYSTEM-001");
        expect(state.audit().filter(item => item.type === "CIP_050_ECOSYSTEM_CERTIFIED")).toHaveLength(0);
    });
});
