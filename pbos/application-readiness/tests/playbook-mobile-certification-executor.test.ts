import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GenesisStateRepository, VerifiableApproval } from "../../genesis-state";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { playbookMobileCertificationExecutor } from "../playbook-mobile-certification-executor";

const session = { sessionId: "session-mobile-certification", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
        domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY", capabilities: [] },
    grant: { grantId: "grant", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
        branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY", allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM",
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } } as const;
const run = { runId: "certification-run-12345678", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingBranch: "main", startingCommit: "abc1234" } as ProductionRun;
const mission = { missionId: "049-certification", systemId: "PLAYBOOK-SYSTEM-001",
    title: "Certify mobile release candidates", dependencies: ["049-store-readiness"], status: "ACTIVE" as const,
    rationale: "Store readiness is certified.", approvalRequired: true, evidenceIds: [] };

function stateWithCertifiedStoreRun(): GenesisStateRepository {
    const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-mobile-certification-")), "state.json"));
    const storeRun = { runId: "store-run", systemId: "PLAYBOOK-SYSTEM-001",
        repository: "sgwalton87/playbook-platform", selectedMission: "Prepare Apple and Google store releases",
        status: "CERTIFIED", currentCommit: "def5678", previewArtifactIds: ["preview:store-run"],
        functionalAcceptancePlan: { durablePreview: { webUrl: "https://web.example", mobileUrl: "https://android.example",
            iosUrl: "https://ios.example", androidUrl: "https://android.example", healthPath: "/login",
            providerEvidence: { provider: "EAS", commit: "def5678", iosPreviewBuildId: "ios-preview",
                androidPreviewBuildId: "android-preview", iosStoreBuildId: "ios-store", androidStoreBuildId: "android-store" },
            label: "SEEDED" } }
    } as unknown as ProductionRun;
    state.saveProductionRun(storeRun);
    const approval: VerifiableApproval = { approvalId: "store-certification-approval", operatorId: "operator",
        organizationId: "org", action: "CERTIFY_PRODUCTION_MISSION", resource: "store-run",
        issuedAt: "2026-08-06T00:00:00.000Z", expiresAt: "2026-08-06T00:15:00.000Z", signature: "signature" };
    state.appendAudit({ eventId: approval.approvalId, type: "VERIFIABLE_APPROVAL", actorId: "operator",
        resource: "store-run", occurredAt: approval.issuedAt,
        evidence: { approval, purpose: "CERTIFY_PRODUCTION_MISSION" } });
    return state;
}

describe("CIP-049 mobile final-certification adapter", () => {
    it("binds certified store lineage to a new exact-revision candidate without self-certifying", async () => {
        const generated = new Map<string, string>();
        const approvals: Array<{ action: string; approval?: string }> = [];
        const gateway = { inspectRepository: async () => ({ revision: "abc1234" }),
            readFileAtRevision: async (_reference: unknown, path: string) => path === "pbos/readiness/049-store-readiness.json"
                ? '{"missionId": "049-store-readiness", "targets": ["TESTFLIGHT", "GOOGLE_PLAY_INTERNAL"]}' : "",
            workingDirectory: async () => "/private/tmp/playbook-mobile-certification",
            createBranch: async () => undefined,
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path); },
            commit: async () => "fed9876", push: async () => undefined,
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/67", number: 67,
                branch: "agent/mobile-certification", repository: "sgwalton87/playbook-platform" }) } as unknown as GitHubRepositoryGateway;
        const result = await playbookMobileCertificationExecutor({ gateway, session: session as never,
            state: stateWithCertifiedStoreRun(), deploymentApprovalId: "mobile-certification-deployment",
            verifyHistoricalApproval: approval => approval.approvalId === "store-certification-approval",
            authorize: (action, _risk, _branch, approval) => { approvals.push({ action, approval }); return {
                decisionId: action, grantId: "grant", action, allowed: true, reason: "authorized",
                explicitApprovalId: approval, decidedAt: new Date() }; },
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-certification",
                systemId: "PLAYBOOK-SYSTEM-001", pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5,
                state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } })(
            { run, mission, report: () => undefined });

        expect(approvals).toContainEqual({ action: "DEPLOY_STAGING", approval: "mobile-certification-deployment" });
        expect(generated.get("pbos/readiness/049-mobile-certification.json")).toContain("store-certification-approval");
        expect(generated.get("pbos/readiness/049-mobile-certification.json")).toContain("PENDING_EXACT_REVISION_ACCEPTANCE");
        expect(generated.get("pbos/readiness/049-mobile-certification.json")).toContain("PBOS_DURABLE_RUNTIME_STATE");
        expect(generated.get("pbos/readiness/049-mobile-certification.json")).not.toContain("https://ios.example");
        expect(generated.get("pbos/readiness/049-mobile-certification.json")).not.toContain('"state": "CERTIFIED"');
        expect(result.functionalAcceptancePlan?.previewDeployment).toMatchObject({ provider: "EAS", commit: "fed9876",
            approvalId: "mobile-certification-deployment" });
        expect(result.evidenceIds).toContain("prior-store-run:store-run");
    });

    it("fails closed before repository mutation when certified store lineage is absent", async () => {
        const state = new GenesisStateRepository(join(mkdtempSync(join(tmpdir(), "pbos-mobile-certification-empty-")), "state.json"));
        const executor = playbookMobileCertificationExecutor({ gateway: {} as GitHubRepositoryGateway,
            session: session as never, state, deploymentApprovalId: "approval", verifyHistoricalApproval: () => true,
            authorize: action => ({ decisionId: action, grantId: "grant", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }), remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined }))
            .rejects.toThrow("certified 049-store-readiness production run");
    });

    it("rejects an unverifiable historical store certification approval", async () => {
        const executor = playbookMobileCertificationExecutor({ gateway: {} as GitHubRepositoryGateway,
            session: session as never, state: stateWithCertifiedStoreRun(), deploymentApprovalId: "approval",
            verifyHistoricalApproval: () => false,
            authorize: action => ({ decisionId: action, grantId: "grant", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }), remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined }))
            .rejects.toThrow("missing or unverifiable");
    });
});
