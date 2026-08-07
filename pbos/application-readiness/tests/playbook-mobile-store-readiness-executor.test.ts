import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { inspectPlaybookMobileReleaseReadiness, playbookMobileReleaseProtectedEnvironmentFiles,
    playbookMobileStoreReadinessExecutor } from "../playbook-mobile-store-readiness-executor";

const session = { sessionId: "session-mobile-store", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
        domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY", capabilities: [] },
    grant: { grantId: "grant", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
        branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY", allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM",
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } } as const;
const run = { runId: "56789012-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingBranch: "main", startingCommit: "abc1234" } as ProductionRun;
const mission = { missionId: "049-store-readiness", systemId: "PLAYBOOK-SYSTEM-001",
    title: "Prepare Apple and Google store releases", dependencies: ["049-mobile-journeys"], status: "ACTIVE" as const,
    rationale: "Native journeys passed.", approvalRequired: true, evidenceIds: [] };

describe("CIP-049 protected mobile store readiness adapter", () => {
    it("reports protected provider names without returning values", async () => {
        const stateHome = mkdtempSync(join(tmpdir(), "pbos-mobile-release-"));
        const [source] = playbookMobileReleaseProtectedEnvironmentFiles(stateHome);
        mkdirSync(join(stateHome, "secrets"), { recursive: true });
        writeFileSync(source.path, "EXPO_TOKEN=protected-token\nEXPO_PROJECT_ID=project-id\n", { mode: 0o600 });

        const readiness = await inspectPlaybookMobileReleaseReadiness({}, stateHome);

        expect(readiness).toMatchObject({ ready: false, available: ["EXPO_PROJECT_ID", "EXPO_TOKEN"],
            missing: ["PBOS_WEB_PREVIEW_URL"] });
        expect(JSON.stringify(readiness)).not.toContain("protected-token");
    });

    it("prepares exact-revision EAS previews and internal-store submissions behind one protected approval", async () => {
        const generated = new Map<string, string>();
        const approvals: Array<{ action: string; approval?: string }> = [];
        const gateway = { inspectRepository: async () => ({ revision: "abc1234" }),
            readFileAtRevision: async (_reference: unknown, path: string) => path === "apps/mobile/app.config.ts"
                ? 'import type { ExpoConfig } from "expo/config";\nconst config: ExpoConfig = { extra: { universalLinkDomain: "app.theplaybook.io", systemId: "PLAYBOOK-SYSTEM-001" } };\nexport default config;\n'
                : path === "apps/mobile/eas.json"
                    ? '{"cli":{"appVersionSource":"remote"},"build":{"preview":{"distribution":"internal"},"production":{}},"submit":{"production":{}}}'
                    : '{"state":"IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION","platforms":["IOS","ANDROID"]}',
            workingDirectory: async () => "/private/tmp/playbook-mobile-store",
            createBranch: async () => undefined,
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path); },
            commit: async () => "def5678", push: async () => undefined,
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/66", number: 66,
                branch: "agent/mobile-store", repository: "sgwalton87/playbook-platform" }) } as unknown as GitHubRepositoryGateway;
        const result = await playbookMobileStoreReadinessExecutor({ gateway, session: session as never,
            deploymentApprovalId: "mobile-release-approval",
            authorize: (action, _risk, _branch, approval) => { approvals.push({ action, approval }); return {
                decisionId: action, grantId: "grant", action, allowed: true, reason: "authorized",
                explicitApprovalId: approval, decidedAt: new Date() }; },
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-store", systemId: "PLAYBOOK-SYSTEM-001",
                pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS",
                evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } })({ run, mission, report: () => undefined });

        expect(approvals).toContainEqual({ action: "DEPLOY_STAGING", approval: "mobile-release-approval" });
        expect(generated.get("apps/mobile/app.config.ts")).toContain("process.env.EXPO_PROJECT_ID");
        expect(generated.get("apps/mobile/eas.json")).toContain('"track": "internal"');
        expect(generated.get("apps/mobile/eas.json")).toContain('"groups"');
        expect(generated.get("apps/mobile/store/screenshots.json")).toContain("PENDING_DEVICE_CAPTURE_AND_HUMAN_APPROVAL");
        expect(generated.get("pbos/readiness/049-store-readiness.json")).toContain("TESTFLIGHT");
        expect(result.functionalAcceptancePlan?.previewDeployment).toMatchObject({ provider: "EAS", commit: "def5678",
            approvalId: "mobile-release-approval", distributionTarget: "TESTFLIGHT_AND_PLAY_INTERNAL" });
        expect(result.functionalAcceptancePlan?.durablePreview).toBeUndefined();
    });

    it("refuses to inspect without explicit mobile release authority", async () => {
        const executor = playbookMobileStoreReadinessExecutor({ gateway: {} as GitHubRepositoryGateway,
            session: session as never, deploymentApprovalId: "", authorize: action => ({ decisionId: action,
                grantId: "grant", action, allowed: true, reason: "authorized", decidedAt: new Date() }),
            remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined }))
            .rejects.toThrow("explicit durable operator approval");
    });
});
