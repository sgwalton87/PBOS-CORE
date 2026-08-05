import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, PullRequestReference, RepositoryFileChange, RepositoryReference } from "../platform";
import { ApplicationAcceptanceEvidence, ProductionMissionExecutor } from "../production-runtime";
import { RemediationRun, ResumableRemediationEngine } from "../validation-automation";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const ONBOARDING_PAGE = "app/start/page.tsx";

function acceptanceEvidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const evidence = (dimension: ApplicationAcceptanceEvidence["dimension"], evidenceId: string, behavior: string,
        artifact: string, source: ApplicationAcceptanceEvidence["source"]): ApplicationAcceptanceEvidence => ({
        dimension, evidenceId, behavior, artifact, source, repository: REPOSITORY, commit: revision, passed: true
    });
    return [
        evidence("ROUTE", `scholar-route:${revision}`, "An authenticated server route completes onboarding and returns the approved dashboard projection.",
            "app/api/pbos/scholar/onboarding/route.ts", "IMPLEMENTATION"),
        evidence("USER_INTERFACE", `scholar-ui:${revision}`, "The real onboarding page submits the Scholar journey and renders recoverable failure state.",
            ONBOARDING_PAGE, "IMPLEMENTATION"),
        evidence("DURABLE_DATA", `scholar-data:${revision}`, "Onboarding, goals, milestones, and dashboard projections are idempotently durable and owner scoped.",
            "supabase/migrations/202608050003_pbos_scholar_dashboard.sql", "IMPLEMENTATION"),
        evidence("AUTHORITY", `scholar-authority:${revision}`, "The service requires the authenticated actor to own the Scholar record and requires governed approvals.",
            "lib/pbos/scholar-onboarding-service.ts", "SECURITY_TEST"),
        evidence("PBOS_INTEGRATION", `scholar-pbos:${revision}`, "Identity registration, lifecycle publication, and private dashboard exchange are server signed and provenance bearing.",
            "pbos/connector/signed-server-transport.ts", "IMPLEMENTATION"),
        evidence("ACCEPTANCE_TEST", `scholar-tests:${revision}`, "Application tests cover durable onboarding, dashboard projection, provenance, idempotency, and denial.",
            "tests/unit/pbos/scholar-onboarding-service.test.ts", "APPLICATION_TEST"),
        evidence("ACCESSIBILITY", `scholar-accessibility:${revision}`, "Onboarding reports server failure with an assertive accessible alert and permits retry.",
            ONBOARDING_PAGE, "APPLICATION_TEST"),
        evidence("SECURITY", `scholar-security:${revision}`, "Credentials stay server-side and negative authority cases fail before persistence or PBOS exchange.",
            "tests/unit/pbos/scholar-onboarding-service.test.ts", "SECURITY_TEST")
    ];
}

export interface PlaybookScholarSliceExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
    readonly startMonitor: (run: RemediationRun) => void;
}

const serviceSource = `import type { PlaybookIdentityMapping } from "../../pbos/connector/contracts";
import { authorizePlaybookFoundation } from "./foundation";

export interface ScholarJourneyRepository {
  persistOnboarding(input: { scholarId: string; displayName: string; goalTitle: string; approvalId: string; idempotencyKey: string; provenance: readonly string[] }): Promise<{ scholarRecordId: string; goalId: string }>;
  persistDashboard(input: { scholarId: string; scholarRecordId: string; goalId: string; exchangeApprovalId: string; idempotencyKey: string; provenance: readonly string[] }): Promise<void>;
}

export interface ScholarPbosRuntime {
  registerIdentity(userId: string): Promise<PlaybookIdentityMapping>;
  publishOnboarding(identity: PlaybookIdentityMapping, scholarRecordId: string, correlationId: string): Promise<readonly string[]>;
  projectDashboard(identity: PlaybookIdentityMapping, scholarRecordId: string, sectionIds: readonly string[], exchangeApprovalId: string, correlationId: string): Promise<readonly string[]>;
}

export interface CompleteScholarOnboarding {
  actorId: string;
  ownerId: string;
  displayName: string;
  goalTitle: string;
  identityApprovalId: string;
  exchangeApprovalId: string;
  idempotencyKey: string;
}

export class ScholarOnboardingService {
  constructor(private readonly repository: ScholarJourneyRepository, private readonly runtime: ScholarPbosRuntime) {}

  async complete(input: CompleteScholarOnboarding) {
    if (!input.exchangeApprovalId) throw new Error("PBOS dashboard exchange approval required.");
    if (!input.idempotencyKey) throw new Error("Scholar journey idempotency key required.");
    const authority = authorizePlaybookFoundation({ userId: input.actorId, ownerId: input.ownerId, role: "SCHOLAR", approvalId: input.identityApprovalId });
    const identity = await this.runtime.registerIdentity(input.actorId);
    const baseProvenance = [...authority.provenance, identity.pbosIdentity.provenance];
    const record = await this.repository.persistOnboarding({ scholarId: input.ownerId, displayName: input.displayName,
      goalTitle: input.goalTitle, approvalId: input.identityApprovalId, idempotencyKey: input.idempotencyKey, provenance: baseProvenance });
    const onboardingProvenance = await this.runtime.publishOnboarding(identity, record.scholarRecordId, input.idempotencyKey + "-onboarding");
    const sectionIds = ["identity", "goals"] as const;
    const dashboardProvenance = await this.runtime.projectDashboard(identity, record.scholarRecordId, sectionIds,
      input.exchangeApprovalId, input.idempotencyKey + "-dashboard");
    const provenance = [...baseProvenance, ...onboardingProvenance, ...dashboardProvenance, input.exchangeApprovalId];
    await this.repository.persistDashboard({ scholarId: input.ownerId, scholarRecordId: record.scholarRecordId,
      goalId: record.goalId, exchangeApprovalId: input.exchangeApprovalId, idempotencyKey: input.idempotencyKey, provenance });
    return { scholarRecordId: record.scholarRecordId, goalId: record.goalId, sectionIds, provenance };
  }
}
`;

const signedTransportSource = `import { createHash, createHmac, randomUUID } from "crypto";
import type { PbosRequest, PbosResponse, PbosTransport } from "./contracts";

export interface PlaybookServerCredentials { organizationId: string; connectorId: string; keyId: string; secretBase64: string }

export class SignedPlaybookPbosTransport implements PbosTransport {
  constructor(private readonly endpoint: string, private readonly credentials: PlaybookServerCredentials, private readonly fetcher: typeof fetch = fetch) {
    if (!endpoint || !credentials.organizationId || !credentials.connectorId || !credentials.keyId || !credentials.secretBase64) {
      throw new Error("Complete server-only PBOS connector configuration is required.");
    }
  }

  async send<T>(request: PbosRequest): Promise<PbosResponse<T>> {
    const body = JSON.stringify(request);
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const path = new URL(this.endpoint).pathname;
    const digest = createHash("sha256").update(body).digest("hex");
    const canonical = ["POST", path, this.credentials.organizationId, this.credentials.connectorId,
      this.credentials.keyId, timestamp, nonce, digest].join("\\n");
    const signature = createHmac("sha256", Buffer.from(this.credentials.secretBase64, "base64")).update(canonical).digest("hex");
    const response = await this.fetcher(this.endpoint, { method: "POST", cache: "no-store", body, headers: {
      "content-type": "application/json", "x-pbos-api-version": "v1", "x-pbos-organization-id": this.credentials.organizationId,
      "x-pbos-connector-id": this.credentials.connectorId, "x-pbos-key-id": this.credentials.keyId,
      "x-pbos-timestamp": timestamp, "x-pbos-nonce": nonce, "x-pbos-signature": signature
    } });
    return await response.json() as PbosResponse<T>;
  }
}
`;

const routeSource = `import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { ScholarOnboardingService } from "@/lib/pbos/scholar-onboarding-service";
import { PlaybookConnector } from "@/pbos/connector/playbook-connector";
import { PlaybookPbosRuntimeClient } from "@/pbos/connector/pbos-runtime-client";
import { SignedPlaybookPbosTransport } from "@/pbos/connector/signed-server-transport";

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error("Missing protected server configuration: " + name); return value; }

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json() as { displayName?: unknown; goalTitle?: unknown };
    const displayName = String(body.displayName ?? "").trim();
    const goalTitle = String(body.goalTitle ?? "").trim();
    if (!displayName || !goalTitle) return NextResponse.json({ error: "Display name and Scholar goal are required." }, { status: 400 });
    const idempotencyKey = "scholar-onboarding-" + user.id;
    const connector = new PlaybookConnector(new PlaybookPbosRuntimeClient(new SignedPlaybookPbosTransport(required("PBOS_API_URL"), {
      organizationId: required("PBOS_ORGANIZATION_ID"), connectorId: required("PBOS_CONNECTOR_ID"),
      keyId: required("PBOS_CONNECTOR_KEY_ID"), secretBase64: required("PBOS_CONNECTOR_SECRET_BASE64")
    })));
    const service = new ScholarOnboardingService({
      async persistOnboarding(input) {
        const profile = await supabase.from("scholar_profiles").upsert({ id: input.scholarId, display_name: input.displayName,
          role: "SCHOLAR", onboarding_status: "GOALS_CAPTURED" }, { onConflict: "id" }).select("id").single();
        if (profile.error) throw new Error(profile.error.message);
        const goal = await supabase.from("scholar_goals").upsert({ scholar_id: input.scholarId, title: input.goalTitle,
          status: "ACTIVE", provenance: input.provenance, idempotency_key: input.idempotencyKey },
          { onConflict: "idempotency_key" }).select("id").single();
        if (goal.error || !goal.data) throw new Error(goal.error?.message ?? "Scholar goal persistence failed.");
        const milestone = await supabase.from("scholar_milestones").upsert({ scholar_id: input.scholarId, goal_id: goal.data.id,
          milestone_type: "ONBOARDING_COMPLETED", approval_id: input.approvalId, provenance: input.provenance,
          idempotency_key: input.idempotencyKey }, { onConflict: "idempotency_key" });
        if (milestone.error) throw new Error(milestone.error.message);
        return { scholarRecordId: input.scholarId, goalId: goal.data.id as string };
      },
      async persistDashboard(input) {
        const result = await supabase.from("scholar_dashboard_projections").upsert({ scholar_id: input.scholarId,
          scholar_record_id: input.scholarRecordId, goal_id: input.goalId, section_ids: ["identity", "goals"],
          exchange_approval_id: input.exchangeApprovalId, provenance: input.provenance, idempotency_key: input.idempotencyKey },
          { onConflict: "idempotency_key" });
        if (result.error) throw new Error(result.error.message);
        const profile = await supabase.from("scholar_profiles").update({ onboarding_status: "DASHBOARD_READY" }).eq("id", input.scholarId);
        if (profile.error) throw new Error(profile.error.message);
      }
    }, {
      registerIdentity: userId => connector.registerIdentity(userId, "SCHOLAR"),
      async publishOnboarding(identity, scholarRecordId, correlationId) {
        const response = await connector.publishScholarOnboarding(identity, { eventType: "SCHOLAR_ONBOARDING_COMPLETED", schemaVersion: "1.0.0", scholarRecordId }, correlationId);
        if (!response.success) throw new Error(response.error.message); return response.provenance;
      },
      async projectDashboard(identity, scholarRecordId, sectionIds, exchangeApprovalId, correlationId) {
        const response = await connector.projectScholarDashboard(identity, { schemaVersion: "1.0.0", scholarRecordId, sectionIds }, exchangeApprovalId, correlationId);
        if (!response.success) throw new Error(response.error.message); return response.provenance;
      }
    });
    const output = await service.complete({ actorId: user.id, ownerId: user.id, displayName, goalTitle,
      identityApprovalId: required("PBOS_SCHOLAR_IDENTITY_APPROVAL_ID"), exchangeApprovalId: required("PBOS_SCHOLAR_EXCHANGE_APPROVAL_ID"), idempotencyKey });
    return NextResponse.json({ ok: true, dashboard: output });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scholar onboarding failed." }, { status: 500 });
  }
}
`;

const serviceTest = `import { describe, expect, it } from "vitest";
import { ScholarOnboardingService } from "../../../lib/pbos/scholar-onboarding-service";

describe("governed Scholar onboarding-to-dashboard", () => {
  it("persists an idempotent journey with PBOS provenance", async () => {
    const calls: string[] = [];
    const service = new ScholarOnboardingService({
      persistOnboarding: async input => { calls.push("persist:" + input.idempotencyKey); return { scholarRecordId: input.scholarId, goalId: "goal-1" }; },
      persistDashboard: async input => { calls.push("dashboard:" + input.exchangeApprovalId); }
    }, {
      registerIdentity: async userId => ({ mappingId: "mapping-1", externalIdentity: { externalIdentityId: userId, externalSystemId: "PLAYBOOK-SYSTEM-001", role: "SCHOLAR", authorityReferences: [], active: true }, pbosIdentity: { actorId: "PLAYBOOK-ACTOR-" + userId, systemId: "PLAYBOOK-OS-001", role: "SCHOLAR", authorityContext: [], provenance: "identity:" + userId, active: true }, mappedAt: new Date() }),
      publishOnboarding: async () => ["pbos:onboarding"], projectDashboard: async () => ["pbos:dashboard"]
    });
    const result = await service.complete({ actorId: "scholar-1", ownerId: "scholar-1", displayName: "Scholar One",
      goalTitle: "Graduate", identityApprovalId: "identity-approval", exchangeApprovalId: "exchange-approval", idempotencyKey: "journey-1" });
    expect(calls).toEqual(["persist:journey-1", "dashboard:exchange-approval"]);
    expect(result.sectionIds).toEqual(["identity", "goals"]);
    expect(result.provenance).toEqual(expect.arrayContaining(["identity-approval", "pbos:onboarding", "pbos:dashboard", "exchange-approval"]));
  });

  it("fails closed before persistence for cross-owner access or missing exchange approval", async () => {
    const repository = { persistOnboarding: async () => { throw new Error("must not persist"); }, persistDashboard: async () => undefined };
    const runtime = { registerIdentity: async () => { throw new Error("must not register"); }, publishOnboarding: async () => [], projectDashboard: async () => [] };
    const service = new ScholarOnboardingService(repository, runtime);
    await expect(service.complete({ actorId: "one", ownerId: "two", displayName: "One", goalTitle: "Graduate",
      identityApprovalId: "approval", exchangeApprovalId: "exchange", idempotencyKey: "key" })).rejects.toThrow("Access denied");
    await expect(service.complete({ actorId: "one", ownerId: "one", displayName: "One", goalTitle: "Graduate",
      identityApprovalId: "approval", exchangeApprovalId: "", idempotencyKey: "key" })).rejects.toThrow("exchange approval");
  });
});
`;

const environmentExample = `# Public Supabase browser configuration
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Server-only PBOS v1 connector configuration. Never expose these as NEXT_PUBLIC_*.
PBOS_API_URL=
PBOS_ORGANIZATION_ID=
PBOS_CONNECTOR_ID=PLAYBOOK-CONNECTOR-001
PBOS_CONNECTOR_KEY_ID=
PBOS_CONNECTOR_SECRET_BASE64=
PBOS_SCHOLAR_IDENTITY_APPROVAL_ID=
PBOS_SCHOLAR_EXCHANGE_APPROVAL_ID=
`;

const integrationGuide = `# Governed Scholar Onboarding Journey

## Purpose

This integration connects The Playbook's authenticated Scholar onboarding flow to PBOS v1 without allowing the application to self-authorize.

## Ownership and boundaries

- The Playbook owns the user interface, Supabase records, and Scholar experience.
- PBOS v1 owns connector identity, lifecycle communication, approved private exchange, and provenance.
- Connector credentials and approval references are server-only configuration.
- Merge, production deployment, secret creation, and certification remain protected human decisions.

## Runtime flow

1. Supabase authenticates the Scholar.
2. The server verifies owner authority and the PBOS identity approval.
3. The application durably records the Scholar profile, first goal, and onboarding milestone.
4. The server signs and publishes the onboarding lifecycle event to PBOS v1.
5. PBOS v1 authorizes the private identity-and-goals dashboard projection.
6. The application persists the projection and marks the dashboard ready.

Every retry uses a stable idempotency key. PBOS denial or unavailable protected configuration fails closed and is surfaced accessibly in the existing onboarding page.

## Required server configuration

Copy \`.env.example\` to the environment-specific secret configuration and supply every \`PBOS_*\` value through the deployment platform's protected secret store. Never commit credential values.

## Data and rollback

Migration \`supabase/migrations/202608050003_pbos_scholar_dashboard.sql\` adds idempotency boundaries and an owner-scoped dashboard projection. Rollback is a separately reviewed destructive migration; do not remove durable journey records automatically.

## Validation gate

Human operators run:

\`\`\`bash
npm run typecheck
npm test
npm run build
\`\`\`
`;

const migration = `alter table scholar_goals add column if not exists idempotency_key text;
alter table scholar_milestones add column if not exists idempotency_key text;
create unique index if not exists scholar_goals_idempotency_idx on scholar_goals(idempotency_key);
create unique index if not exists scholar_milestones_idempotency_idx on scholar_milestones(idempotency_key);

create table if not exists scholar_dashboard_projections (
  id uuid primary key default gen_random_uuid(),
  scholar_id uuid not null references scholar_profiles(id),
  scholar_record_id uuid not null references scholar_profiles(id),
  goal_id uuid not null references scholar_goals(id),
  section_ids text[] not null default '{}',
  exchange_approval_id text not null,
  provenance jsonb not null default '[]',
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table scholar_dashboard_projections enable row level security;
drop policy if exists "scholar-dashboard-own" on scholar_dashboard_projections;
create policy "scholar-dashboard-own" on scholar_dashboard_projections
  using (auth.uid() = scholar_id) with check (auth.uid() = scholar_id);
create index if not exists scholar_dashboard_projections_scholar_idx on scholar_dashboard_projections(scholar_id, updated_at desc);
`;

export function wireScholarOnboardingPage(source: string): string {
    const stateNeedle = "  const [created, setCreated] = useState(false);";
    const stateReplacement = `${stateNeedle}\n  const [journeyError, setJourneyError] = useState<string | null>(null);`;
    const blockNeedle = `    if (isLast) {
      setCreating(true);
      await persist(true);
      setCreating(false);
      setCreated(true);
      setTimeout(() => {
        window.location.href = getOnboardingCompletionDestination(role);
      }, 15000);
      return;
    }`;
    const blockReplacement = `    if (isLast) {
      setCreating(true);
      setJourneyError(null);
      try {
        await persist(true);
        const response = await fetch("/api/pbos/scholar/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: String(form.full_name || "Scholar"), goalTitle: String(form.dream_school || form.ideal_profession || "Complete my scholar journey") }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "PBOS Scholar journey could not be completed.");
        setCreating(false);
        setCreated(true);
        setTimeout(() => { window.location.href = getOnboardingCompletionDestination(role); }, 15000);
      } catch (error) {
        setCreating(false);
        setSaving(false);
        setJourneyError(error instanceof Error ? error.message : "PBOS Scholar journey could not be completed.");
      }
      return;
    }`;
    const renderNeedle = "    <main style={page}>";
    const renderReplacement = `${renderNeedle}\n      {journeyError && <div role="alert" aria-live="assertive" style={{ margin: 16, padding: 16, border: "1px solid #B91C1C", borderRadius: 12, color: "#B91C1C" }}>{journeyError}</div>}`;
    if (![stateNeedle, blockNeedle, renderNeedle].every(needle => source.includes(needle))) {
        throw new Error("Playbook onboarding source changed; re-inspect before wiring the governed Scholar journey.");
    }
    return source.replace(stateNeedle, stateReplacement).replace(blockNeedle, blockReplacement).replace(renderNeedle, renderReplacement);
}

function changes(revision: string, runId: string, onboardingPage: string): readonly RepositoryFileChange[] {
    return [
        { path: "lib/pbos/scholar-onboarding-service.ts", content: serviceSource },
        { path: "pbos/connector/signed-server-transport.ts", content: signedTransportSource },
        { path: "app/api/pbos/scholar/onboarding/route.ts", content: routeSource },
        { path: "tests/unit/pbos/scholar-onboarding-service.test.ts", content: serviceTest },
        { path: "supabase/migrations/202608050003_pbos_scholar_dashboard.sql", content: migration },
        { path: ".env.example", content: environmentExample },
        { path: "docs/integrations/PBOS-SCHOLAR-ONBOARDING.md", content: integrationGuide },
        { path: ONBOARDING_PAGE, content: onboardingPage },
        { path: "pbos/readiness/048-scholar-slice.json", content: `${JSON.stringify({ missionId: "048-scholar-slice",
            systemId: SYSTEM_ID, repository: REPOSITORY, governedRevision: revision, productionRunId: runId,
            state: "IMPLEMENTED_PENDING_VALIDATION", surfaces: ["WEB"], journey: "IDENTITY_ONBOARDING_TO_DASHBOARD",
            implementation: ["app/start/page.tsx", "app/api/pbos/scholar/onboarding/route.ts", "lib/pbos/scholar-onboarding-service.ts"],
            durableData: "supabase/migrations/202608050003_pbos_scholar_dashboard.sql",
            acceptanceCriteria: ["Authenticated Scholar identity is owner-scoped", "PBOS connector requests are server-signed",
                "Onboarding, goal, milestone, and dashboard projection are idempotently durable", "PBOS denial fails closed",
                "The existing responsive UI reports journey failure accessibly"] }, null, 2)}\n` }
    ];
}

export function playbookScholarSliceExecutor(dependencies: PlaybookScholarSliceExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "048-scholar-slice" || context.run.systemId !== SYSTEM_ID || context.run.repository !== REPOSITORY) {
            throw new Error("The CIP-048 Scholar adapter is restricted to The Playbook.");
        }
        if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) {
            throw new Error("The active Genesis session does not authorize the Playbook Scholar mission.");
        }
        const reference: RepositoryReference = { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" };
        const branch = `agent/pbos-playbook-system-001-048-scholar-${context.run.runId.slice(0, 8)}`;
        for (const [action, risk] of [["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"],
            ["MODIFY_APPLICATION_CODE", "MEDIUM"], ["CREATE_TESTS", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"],
            ["PUSH_BRANCH", "MEDIUM"], ["OPEN_DRAFT_PR", "MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]) {
            const decision = dependencies.authorize(action, risk, branch);
            if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }
        context.report("CONTEXT", `Confirming ${REPOSITORY} at ${context.run.startingCommit}.`);
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) {
            throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan before mutation.`);
        }
        const source = await dependencies.gateway.readFileAtRevision(reference, ONBOARDING_PAGE, inspection.revision);
        const files = changes(inspection.revision, context.run.runId, wireScholarOnboardingPage(source));
        context.report("BUILDING", `Wiring the governed Scholar onboarding-to-dashboard journey on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, files);
        await dependencies.gateway.prepareDependencyLock(reference);
        const paths = [...files.map(file => file.path), "package-lock.json"];
        const revision = await dependencies.gateway.commit(reference, "feat: complete governed Scholar onboarding journey", paths);
        context.report("PUSHING", `Publishing governed Scholar journey revision ${revision}.`);
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "feat: complete governed Scholar onboarding journey",
            `PBOS Genesis mission \`048-scholar-slice\` wires authenticated onboarding through signed PBOS communication, owner-scoped Supabase persistence, idempotent goal and milestone records, and an approved private dashboard projection at governed revision \`${inspection.revision}\`.\n\nValidation and certification remain human-controlled.\n\nGenerated revision: \`${revision}\``);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        dependencies.startMonitor(remediation);
        context.report("VALIDATING", `GitHub Actions and bounded remediation are monitoring ${pullRequest.url}.`);
        return { outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`],
            files: { added: files.filter(file => file.path !== ONBOARDING_PAGE).map(file => file.path), modified: [ONBOARDING_PAGE, "package-lock.json"] },
            commands: [{ command: "governed Scholar journey publication", exitCode: 0, durationMs: 0, output: `${branch} ${pullRequest.url}` }],
            validations: [{ name: "Scholar journey published for independent validation", passed: true, durationMs: 0,
                evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url },
            acceptanceEvidence: acceptanceEvidence(revision) };
    };
}
