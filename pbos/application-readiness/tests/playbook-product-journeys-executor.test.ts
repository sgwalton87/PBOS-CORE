import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { isProductScholarDashboardContrastDefect, playbookProductJourneysExecutor,
    preparePlaybookProductScholarContrastRecovery, wireProductScholarDashboardContrast } from "../playbook-product-journeys-executor";
import { PLAYBOOK_CANON_SOURCES } from "../playbook-canon-product-graph";
import { PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS, PLAYBOOK_CANONICAL_OPERATING_SYSTEMS,
    PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS, playbookCanonicalJourneySpecification } from "../playbook-full-canonical-roadmap";

const session = { sessionId: "session-product", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook", domain: "Education",
        repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const, capabilities: [] },
    grant: { grantId: "grant", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform", branchPattern: "agent/*",
        mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } };
const run = { runId: "12345678-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingBranch: "main", startingCommit: "cdef123" } as ProductionRun;
const mission = { missionId: "048-product-journeys", systemId: "PLAYBOOK-SYSTEM-001", title: "Certify connected Playbook product journeys",
    dependencies: [], status: "ACTIVE" as const, rationale: "All journey dependencies are complete.", approvalRequired: true, evidenceIds: [] };
const crossDomainJourneyIds = ["SCHOLAR-ONBOARDING-TO-DASHBOARD", "TRANSCRIPT-TO-ACADEMIC-READINESS",
    "READINESS-TO-OPPORTUNITY", "OPPORTUNITY-TO-APPLICATION", "APPLICATION-TO-AUTHORIZED-SUPPORT",
    "AUTHORIZED-SUPPORT-MESSAGING", "EVENT-TO-ACKNOWLEDGED-NOTIFICATION"];
const allJourneyIds = [...PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS, ...crossDomainJourneyIds];
const contractByPath: Readonly<Record<string, string>> = Object.fromEntries(allJourneyIds
    .map(journeyId => [playbookCanonicalJourneySpecification(journeyId), `test ${journeyId}`]));
const roleByPathway: Readonly<Record<string, string>> = {
    SCHOLAR: "Scholar", SCHOLAR_ATHLETE: "Scholar-Athlete", PARENT_GUARDIAN: "Family",
    TEACHER_EDUCATOR: "Educator", HIGH_SCHOOL_COUNSELOR: "High School Counselor", MENTOR: "Mentor",
    HIGH_SCHOOL_COACH: "High School Coach", COLLEGE_COACH_RECRUITER: "College Coach / Recruiter",
    COLLEGE_ADMISSIONS: "College Admissions Officer", BRAND_PARTNER: "Brand Partner", EMPLOYER: "Employer",
    TRANSITION_AGED_YOUTH: "Transition-Aged Youth", ATHLETES_ABROAD: "Athletes Abroad",
    DISTRICT_SCHOOL_ADMIN: "District / School Administrator", COMMUNITY_PARTNER: "Community Partner"
};
const roleJourneys = ["# User Journeys", "## Role journey index",
    "| Role | Signup | Onboarding | OS landing | Permissions | Verification | Current status |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.map(pathway => {
        const os = PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.find(item => item.osId === pathway.operatingSystemId)!;
        return `| ${roleByPathway[pathway.pathwayId]} | Complete | Complete | \`${os.route}\` | Complete | Complete | COMPLETE |`;
    })].join("\n");
const uniqueRoutes = [...new Set(PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.map(item => item.route))];
const trackedFiles = uniqueRoutes.map(route => `app${route}/page.tsx`);
const canonicalRouteMap = uniqueRoutes.map((route, index) =>
    `| OS ${index + 1} | \`${route}\` | \`app${route}/page.tsx\` | shell | PGOS-${String(index + 1).padStart(3, "0")} implemented | none | route | none |`).join("\n");

const canonByPath: Readonly<Record<string, string>> = Object.fromEntries(PLAYBOOK_CANON_SOURCES.map(path => [path,
    path === "docs/MASTER_CHECKLIST.md" ? Array.from({ length: 15 }, (_, index) =>
        `# Phase ${index + 1} — Phase ${index + 1}\n**Completion:** 100%`).join("\n") :
    path === "docs/USER_JOURNEYS.md" ? roleJourneys :
    path === "pbos/readiness/048-canon-journeys.json" ? JSON.stringify({ governedRevision: "cdef123",
        productJourneys: allJourneyIds.map(journeyId => ({ journeyId })) }) :
    path === "docs/INTELLIGENCE/PLAYBOOK_TRACEABILITY_MATRIX.md"
        ? "| CMP-01 | Compass consumes Scholar data | Existing | implementation | none |" :
    path === "docs/design/CANONICAL_ROUTE_MAP.md"
        ? canonicalRouteMap :
    "Canonical authority."]));

describe("CIP-048 connected product execution adapter", () => {
    it("recovers the exact Scholar dashboard contrast defect on the existing product pull request", async () => {
        const branch = "agent/pbos-playbook-system-001-048-product-12345678";
        const blockedRun = { ...run, status: "BLOCKED" as const, currentBranch: branch, currentCommit: "abcde12",
            selectedMission: "Certify connected Playbook product journeys",
            terminalSummary: "Browser journey command failed for SCHOLAR-ONBOARDING-TO-DASHBOARD: " +
                '"id": "color-contrast" Action needed #94a3b8 #ffffff continue-learning-title' } as ProductionRun;
        const source = `color: item.met\n                        ? COLORS.green\n                        : item.inProgress\n                        ? COLORS.amber\n                        : COLORS.faint,\n                    }}`;
        const generated = new Map<string, string>();
        const registered: string[] = [];
        const gateway = { inspectRepository: async () => ({ revision: "abcde12" }),
            readFileAtRevision: async () => source,
            applyChange: async (_reference: unknown, changes: readonly { path: string; content: string }[]) => {
                changes.forEach(change => generated.set(change.path, change.content)); return changes.map(change => change.path); },
            commit: async () => "bcdef23", push: async () => undefined } as unknown as GitHubRepositoryGateway;
        const pullRequest = { url: "https://github.com/sgwalton87/playbook-platform/pull/66", number: 66,
            branch, repository: "sgwalton87/playbook-platform" };
        const result = await preparePlaybookProductScholarContrastRecovery({ gateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }), pullRequest,
            remediation: { start: () => ({ runId: "validation-product-repair", systemId: "PLAYBOOK-SYSTEM-001",
                pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS",
                evidence: [], blockers: [], updatedAt: new Date().toISOString() }) },
            production: { registerBoundedRemediation: (_runId, _remediationId, _branch, _revision, classification) => {
                registered.push(classification); return blockedRun;
            } } }, blockedRun);
        expect(isProductScholarDashboardContrastDefect(blockedRun)).toBe(true);
        expect(wireProductScholarDashboardContrast(source)).toContain(": COLORS.muted");
        expect(generated.get("components/ag/AGTracker.tsx")).toContain(": COLORS.muted");
        expect(result).toMatchObject({ branch, revision: "bcdef23" });
        expect(registered).toEqual(["PRODUCT_SCHOLAR_DASHBOARD_CONTRAST"]);
    });

    it("composes the full canonical roadmap into one exact-revision runtime and pull request", async () => {
        const generated = new Map<string, string>();
        const gateway = { inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            revision: "cdef123", findings: [], files: trackedFiles, inspectedAt: new Date() }),
        readFileAtRevision: async (_reference: unknown, path: string) => path === "package.json"
            ? '{"scripts":{"pbos:acceptance:prepare":"node prepare.mjs"}}' : canonByPath[path] ?? contractByPath[path] ?? "",
        workingDirectory: async () => "/tmp/playbook-product", createBranch: async () => undefined,
        applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
            files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path); },
        prepareDependencyLock: async () => undefined, commit: async () => "abcde12", push: async () => undefined,
        openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/62", number: 62,
            branch: "agent/pbos-product", repository: "sgwalton87/playbook-platform" }) } as unknown as GitHubRepositoryGateway;
        const executor = playbookProductJourneysExecutor({ gateway, session, authorize: action => ({ decisionId: action, grantId: "grant",
            action, allowed: true, reason: "authorized", decidedAt: new Date() }), remediation: { start: (_systemId, pullRequest) => ({
                runId: "validation-product", systemId: "PLAYBOOK-SYSTEM-001", pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5,
                state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } });
        const result = await executor({ run, mission, report: () => undefined });
        expect(JSON.parse(generated.get("pbos/readiness/048-product-journeys.json") ?? "{}").journeys).toHaveLength(allJourneyIds.length);
        expect(generated.get("tests/acceptance/pbos-academic.spec.ts")).toContain("passed: true");
        expect(result.functionalAcceptancePlan?.browserJourneys).toHaveLength(allJourneyIds.length);
        expect(new Set(result.functionalAcceptancePlan?.browserJourneys.map(item =>
            item.command.publicEnvironment?.PLAYWRIGHT_BASE_URL))).toEqual(new Set(["http://127.0.0.1:4317"]));
        expect(result.acceptanceEvidence?.some(item => item.dimension === "INDEPENDENT_VALIDATION")).toBe(false);
    });

    it("includes canonical graph revision and journey identifiers in the product manifest", async () => {
        const generated = new Map<string, string>();
        const gateway = { inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
            revision: "cdef123", findings: [], files: trackedFiles, inspectedAt: new Date() }),
        readFileAtRevision: async (_reference: unknown, path: string) => path === "package.json"
            ? '{"scripts":{"pbos:acceptance:prepare":"node prepare.mjs"}}' : canonByPath[path] ?? contractByPath[path] ?? "",
        workingDirectory: async () => "/tmp/playbook-product", createBranch: async () => undefined,
        applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
            files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path); },
        prepareDependencyLock: async () => undefined, commit: async () => "abcde12", push: async () => undefined,
        openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/62", number: 62,
            branch: "agent/pbos-product", repository: "sgwalton87/playbook-platform" }) } as unknown as GitHubRepositoryGateway;
        const executor = playbookProductJourneysExecutor({ gateway, session, authorize: action => ({ decisionId: action, grantId: "grant",
            action, allowed: true, reason: "authorized", decidedAt: new Date() }), remediation: { start: (_systemId, pullRequest) => ({
                runId: "validation-product", systemId: "PLAYBOOK-SYSTEM-001", pullRequest, headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5,
                state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } });
        const result = await executor({ run, mission, report: () => undefined });
        const manifest = JSON.parse(generated.get("pbos/readiness/048-product-journeys.json") ?? "{}");
        expect(manifest.canonicalGraphRevision).toBe("cdef123");
        expect(manifest.journeyIds).toEqual(allJourneyIds);
        expect(result.functionalAcceptancePlan?.browserJourneys).toHaveLength(allJourneyIds.length);
    });

    it("fails closed when a journey contract is missing", async () => {
        const gateway = { inspectRepository: async () => ({ revision: "cdef123", files: trackedFiles }),
            readFileAtRevision: async (_reference: unknown, path: string) => path === "package.json" ? "{}" : canonByPath[path] ?? "",
        } as unknown as GitHubRepositoryGateway;
        const executor = playbookProductJourneysExecutor({ gateway, session, authorize: action => ({ decisionId: action, grantId: "grant",
            action, allowed: true, reason: "authorized", decidedAt: new Date() }), remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("missing or stale");
    });

    it("fails closed when canon omits the full-roadmap journey boundary", async () => {
        const gateway = { inspectRepository: async () => ({ revision: "cdef123", files: trackedFiles }),
            readFileAtRevision: async (_reference: unknown, path: string) => path === "package.json"
                ? "{}"
                : path === "pbos/readiness/048-canon-journeys.json"
                    ? '{"governedRevision":"cdef123","productJourneys":[{"journeyId":"SCHOLAR-ONBOARDING-TO-DASHBOARD"}]}'
                    : canonByPath[path] ?? contractByPath[path] ?? "",
        } as unknown as GitHubRepositoryGateway;
        const executor = playbookProductJourneysExecutor({ gateway, session, authorize: action => ({ decisionId: action, grantId: "grant",
            action, allowed: true, reason: "authorized", decidedAt: new Date() }), remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("canon-to-product convergence is incomplete");
    });
});
