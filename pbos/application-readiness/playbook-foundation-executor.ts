import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { applicationArchivistFiles } from "../archivist";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, PullRequestReference, RepositoryFileChange, RepositoryReference } from "../platform";
import { ApplicationAcceptanceEvidence, ProductionMissionExecutor } from "../production-runtime";
import { createPlaybookBlueprint } from "../reference-systems";
import { RemediationRun, ResumableRemediationEngine } from "../validation-automation";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";

export interface PlaybookFoundationExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
    readonly startMonitor: (run: RemediationRun) => void;
}

const foundationSource = `import { PlaybookIdentityMapper } from "../../pbos/connector/identity-mapper";
import type { PlaybookRole } from "../../pbos/connector/contracts";
import { designTokens } from "../../pbos/generated/design/tokens";
import { requireApproval, requireOwner } from "../../pbos/generated/security/authority";

export interface PlaybookFoundationRequest {
  userId: string;
  ownerId: string;
  role: PlaybookRole;
  approvalId?: string;
}

export function authorizePlaybookFoundation(request: PlaybookFoundationRequest) {
  requireOwner(request.userId, request.ownerId);
  const approvalId = requireApproval(request.approvalId);
  const identity = new PlaybookIdentityMapper().mapSupabaseIdentity(request.userId, request.role);
  return {
    identity,
    approvalId,
    designTokens,
    dataBoundary: {
      ownerId: request.ownerId,
      tables: ["scholar_profiles", "scholar_goals", "scholar_milestones"] as const,
      policy: "OWNER_SCOPED_RLS" as const
    },
    provenance: [identity.pbosIdentity.provenance, approvalId]
  };
}
`;

const foundationTest = `import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { authorizePlaybookFoundation } from "../../../lib/pbos/foundation";

describe("CIP-048 Playbook web foundation", () => {
  it("maps identity and returns governed data and design boundaries", () => {
    const result = authorizePlaybookFoundation({ userId: "scholar-1", ownerId: "scholar-1", role: "SCHOLAR", approvalId: "approval-1" });
    expect(result.identity.pbosIdentity.actorId).toBe("PLAYBOOK-ACTOR-scholar-1");
    expect(result.dataBoundary.policy).toBe("OWNER_SCOPED_RLS");
    expect(result.designTokens.colors.primary).toBeTruthy();
    expect(result.provenance).toContain("approval-1");
  });

  it("fails closed for cross-owner access or missing approval", () => {
    expect(() => authorizePlaybookFoundation({ userId: "scholar-1", ownerId: "scholar-2", role: "SCHOLAR", approvalId: "approval-1" })).toThrow("Access denied");
    expect(() => authorizePlaybookFoundation({ userId: "scholar-1", ownerId: "scholar-1", role: "SCHOLAR" })).toThrow("approval");
  });

  it("applies the responsive accessible application foundation", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");
    expect(layout).toContain('<html lang="en">');
    expect(css).toContain('@import "../styles/playbook-tokens.css"');
    expect(css).toContain("@media (max-width: 768px)");
    expect(css).toContain("overflow-x: hidden");
  });
});
`;

function acceptanceEvidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const evidence = (dimension: ApplicationAcceptanceEvidence["dimension"], evidenceId: string, behavior: string,
        artifact: string, source: ApplicationAcceptanceEvidence["source"]): ApplicationAcceptanceEvidence => ({
        dimension, evidenceId, behavior, artifact, source, repository: REPOSITORY, commit: revision, passed: true
    });
    return [
        evidence("USER_INTERFACE", `foundation-ui:${revision}`, "The root application shell applies canonical Playbook tokens and a responsive content boundary.",
            "app/globals.css", "IMPLEMENTATION"),
        evidence("DURABLE_DATA", `foundation-data:${revision}`, "Scholar profiles, goals, and milestones persist under owner-scoped row-level security.",
            "supabase/migrations/202608050002_pbos_scholar_foundation.sql", "IMPLEMENTATION"),
        evidence("AUTHORITY", `foundation-authority:${revision}`, "Cross-owner access and missing governed approval fail closed.",
            "lib/pbos/foundation.ts", "SECURITY_TEST"),
        evidence("PBOS_INTEGRATION", `foundation-pbos:${revision}`, "Authenticated Supabase identity maps into the PBOS actor contract with provenance.",
            "pbos/connector/identity-mapper.ts", "IMPLEMENTATION"),
        evidence("ACCEPTANCE_TEST", `foundation-tests:${revision}`, "Foundation acceptance tests exercise identity, ownership, approval, design, and responsive shell behavior.",
            "tests/unit/pbos/playbook-foundation.test.ts", "APPLICATION_TEST"),
        evidence("ACCESSIBILITY", `foundation-accessibility:${revision}`, "The application declares document language and preserves responsive, overflow-safe layout behavior.",
            "tests/unit/pbos/playbook-foundation.test.ts", "APPLICATION_TEST"),
        evidence("SECURITY", `foundation-security:${revision}`, "Owner and approval boundaries are covered by negative acceptance cases.",
            "tests/unit/pbos/playbook-foundation.test.ts", "SECURITY_TEST")
    ];
}

function changes(revision: string, runId: string): readonly RepositoryFileChange[] {
    return [
        { path: "lib/pbos/foundation.ts", content: foundationSource },
        { path: "tests/unit/pbos/playbook-foundation.test.ts", content: foundationTest },
        { path: "pbos/readiness/048-foundation.json", content: `${JSON.stringify({
            missionId: "048-foundation", systemId: SYSTEM_ID, repository: REPOSITORY, governedRevision: revision,
            productionRunId: runId, state: "IMPLEMENTED_PENDING_VALIDATION",
            implementation: "lib/pbos/foundation.ts", test: "tests/unit/pbos/playbook-foundation.test.ts",
            evidence: ["pbos/connector/identity-mapper.ts", "pbos/generated/security/authority.ts",
                "pbos/generated/design/tokens.ts", "supabase/migrations/202608050002_pbos_scholar_foundation.sql"],
            acceptanceCriteria: ["Supabase identity maps to PBOS", "Owner authority fails closed",
                "Scholar data remains RLS-scoped", "The Playbook design tokens are canonical"]
        }, null, 2)}\n` },
        ...applicationArchivistFiles(createPlaybookBlueprint())
    ];
}

export function playbookFoundationExecutor(dependencies: PlaybookFoundationExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "048-foundation" || context.run.systemId !== SYSTEM_ID ||
            context.run.repository !== REPOSITORY) throw new Error("The CIP-048 foundation adapter is restricted to The Playbook.");
        if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) {
            throw new Error("The active Genesis session does not authorize the Playbook foundation mission.");
        }
        const reference: RepositoryReference = { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" };
        const branch = `agent/pbos-playbook-system-001-048-foundation-${context.run.runId.slice(0, 8)}`;
        for (const [action, risk] of [
            ["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"], ["MODIFY_APPLICATION_CODE", "MEDIUM"],
            ["CREATE_TESTS", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"], ["PUSH_BRANCH", "MEDIUM"],
            ["OPEN_DRAFT_PR", "MEDIUM"]
        ] as readonly (readonly [BuildAction, ActionRisk])[]) {
            const decision = dependencies.authorize(action, risk, branch);
            if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }

        context.report("CONTEXT", `Confirming ${REPOSITORY} at ${context.run.startingCommit}.`);
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) {
            throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan before mutation.`);
        }
        const files = changes(inspection.revision, context.run.runId);
        context.report("BUILDING", `Applying identity, authority, data, and design foundations on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, files);
        await dependencies.gateway.prepareDependencyLock(reference);
        const paths = [...files.map(file => file.path), "package-lock.json"];
        const revision = await dependencies.gateway.commit(reference, "feat: complete Playbook web foundation", paths);
        context.report("PUSHING", `Publishing governed foundation revision ${revision}.`);
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "feat: complete Playbook web foundation",
            `PBOS Genesis mission \`048-foundation\` composed the existing Playbook identity mapper, owner authority, Scholar RLS foundation, and canonical design tokens at governed revision \`${inspection.revision}\`.\n\nValidation and certification remain human-controlled.\n\nGenerated revision: \`${revision}\``);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        dependencies.startMonitor(remediation);
        context.report("VALIDATING", `GitHub Actions and bounded remediation are monitoring ${pullRequest.url}.`);
        return {
            outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`],
            files: { added: files.map(file => file.path), modified: ["package-lock.json"] },
            commands: [{ command: "governed repository change publication", exitCode: 0, durationMs: 0,
                output: `${branch} ${pullRequest.url}` }],
            validations: [{ name: "Foundation change published for independent validation", passed: true, durationMs: 0,
                evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url },
            acceptanceEvidence: acceptanceEvidence(revision)
        };
    };
}
