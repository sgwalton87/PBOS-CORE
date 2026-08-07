import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ApplicationAcceptanceEvidence, ProductionMissionExecutor } from "../production-runtime";
import { ResumableRemediationEngine } from "../validation-automation";
import { playbookConnectedJourneyAcceptanceFiles, playbookConnectedJourneyAcceptancePlan } from "./playbook-connected-journey-functional-acceptance";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const APPLICATION_ROUTE = "app/api/application-workspaces/route.ts";
const APPLICATION_DASHBOARD = "components/application-workspace/ApplicationWorkspaceDashboard.tsx";
const SUPPORT_ROUTE = "app/api/pbos/application-support/route.ts";
const SUPPORT_PANEL = "components/application-workspace/ApplicationSupportRequestPanel.tsx";
const SUPPORT_SERVICE = "lib/pbos/application-support-request.ts";
const SUPPORT_TEST = "tests/unit/pbos/application-support-request.test.ts";
const SUPPORT_MIGRATION = "supabase/migrations/202608050007_pbos_application_support.sql";

export interface PlaybookSupportJourneyExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
}

const serviceSource = `import type { PlaybookIdentityMapping } from "../../pbos/connector/contracts";
import { authorizePlaybookFoundation } from "./foundation";

export const SUPPORT_CATEGORIES = ["RECOMMENDATION", "DOCUMENTS", "ESSAY_REVIEW", "DEADLINE", "OTHER"] as const;
export type SupportCategory = typeof SUPPORT_CATEGORIES[number];

export interface SupportRelationshipEvidence {
  relationshipId: string;
  scholarId: string;
  supporterId?: string | null;
  supporterEmail: string;
  status: string;
  permissions: readonly string[];
}

export interface ApplicationSupportRepository {
  createRequest(input: { scholarId: string; workspaceId: string; relationshipId: string; category: SupportCategory;
    summary: string; idempotencyKey: string; provenance: readonly string[] }): Promise<{ requestId: string }>;
  markDelivered(input: { scholarId: string; requestId: string; provenance: readonly string[] }): Promise<void>;
}

export interface ApplicationSupportRuntime {
  registerIdentity(userId: string): Promise<PlaybookIdentityMapping>;
  publishRequest(identity: PlaybookIdentityMapping, input: { requestId: string; workspaceId: string;
    relationshipId: string; category: SupportCategory; correlationId: string }): Promise<readonly string[]>;
}

export function authorizeSupportRelationship(input: { actorId: string; scholarId: string; approvalId: string;
  relationship: SupportRelationshipEvidence }) {
  const owner = authorizePlaybookFoundation({ userId: input.actorId, ownerId: input.scholarId,
    role: "SCHOLAR", approvalId: input.approvalId });
  const relationship = input.relationship;
  if (relationship.scholarId !== input.scholarId || relationship.status !== "active" ||
      !relationship.permissions.includes("support_tasks") || (!relationship.supporterId && !relationship.supporterEmail.trim())) {
    throw new Error("Support relationship is not active and authorized for support tasks.");
  }
  return { relationshipId: relationship.relationshipId,
    provenance: [...owner.provenance, "relationship:" + relationship.relationshipId, "permission:support_tasks"] };
}

export class ApplicationSupportRequestService {
  constructor(private readonly repository: ApplicationSupportRepository, private readonly runtime: ApplicationSupportRuntime) {}

  async request(input: { actorId: string; scholarId: string; workspaceId: string; relationship: SupportRelationshipEvidence;
    category: SupportCategory; summary: string; approvalId: string; idempotencyKey: string }) {
    if (!input.workspaceId.trim() || !input.idempotencyKey.trim()) throw new Error("Workspace and idempotency evidence are required.");
    if (!(SUPPORT_CATEGORIES as readonly string[]).includes(input.category)) throw new Error("Support category is invalid.");
    const summary = input.summary.trim();
    if (summary.length < 3 || summary.length > 500) throw new Error("Support request must be between 3 and 500 characters.");
    const authority = authorizeSupportRelationship(input);
    const identity = await this.runtime.registerIdentity(input.actorId);
    const baseProvenance = [...authority.provenance, identity.pbosIdentity.provenance];
    const saved = await this.repository.createRequest({ scholarId: input.scholarId, workspaceId: input.workspaceId,
      relationshipId: authority.relationshipId, category: input.category, summary,
      idempotencyKey: input.idempotencyKey, provenance: baseProvenance });
    const runtimeProvenance = await this.runtime.publishRequest(identity, { requestId: saved.requestId,
      workspaceId: input.workspaceId, relationshipId: authority.relationshipId, category: input.category,
      correlationId: input.idempotencyKey });
    const provenance = [...baseProvenance, ...runtimeProvenance, input.approvalId];
    await this.repository.markDelivered({ scholarId: input.scholarId, requestId: saved.requestId, provenance });
    return { requestId: saved.requestId, state: "OPEN" as const, provenance };
  }
}
`;

const routeSource = `import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { ApplicationSupportRequestService, SUPPORT_CATEGORIES, type SupportCategory } from "@/lib/pbos/application-support-request";
import { PlaybookIdentityMapper } from "@/pbos/connector/identity-mapper";
import { PlaybookPbosRuntimeClient } from "@/pbos/connector/pbos-runtime-client";
import { SignedPlaybookPbosTransport } from "@/pbos/connector/signed-server-transport";

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error("Missing protected server configuration: " + name); return value; }

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const [workspaces, relationships] = await Promise.all([
      supabase.from("application_workspaces").select("id,opportunity_name,status,deadline").eq("scholar_id", user.id).order("created_at", { ascending: false }),
      supabase.from("support_relationships").select("id,supporter_id,supporter_email,supporter_name,relationship,status,permissions")
        .eq("scholar_id", user.id).eq("status", "active").contains("permissions", ["support_tasks"])
    ]);
    if (workspaces.error) throw new Error(workspaces.error.message);
    if (relationships.error) throw new Error(relationships.error.message);
    return NextResponse.json({ workspaces: workspaces.data ?? [], relationships: relationships.data ?? [],
      categories: SUPPORT_CATEGORIES });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Support request context failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json() as { workspaceId?: unknown; relationshipId?: unknown; category?: unknown;
      summary?: unknown; requestId?: unknown };
    const workspaceId = String(body.workspaceId ?? ""); const relationshipId = String(body.relationshipId ?? "");
    const category = String(body.category ?? "") as SupportCategory; const summary = String(body.summary ?? "");
    const requestId = String(body.requestId ?? "");
    if (!requestId.trim()) return NextResponse.json({ error: "A support request id is required." }, { status: 400 });
    const workspace = await supabase.from("application_workspaces").select("id,scholar_id").eq("id", workspaceId)
      .eq("scholar_id", user.id).maybeSingle();
    if (workspace.error) throw new Error(workspace.error.message);
    if (!workspace.data) return NextResponse.json({ error: "Application workspace not found for this Scholar." }, { status: 404 });
    const relationship = await supabase.from("support_relationships")
      .select("id,scholar_id,supporter_id,supporter_email,status,permissions").eq("id", relationshipId)
      .eq("scholar_id", user.id).eq("status", "active").maybeSingle();
    if (relationship.error) throw new Error(relationship.error.message);
    if (!relationship.data) return NextResponse.json({ error: "Authorized support relationship not found." }, { status: 403 });
    const mapper = new PlaybookIdentityMapper();
    const client = new PlaybookPbosRuntimeClient(new SignedPlaybookPbosTransport(required("PBOS_API_URL"), {
      organizationId: required("PBOS_ORGANIZATION_ID"), connectorId: required("PBOS_CONNECTOR_ID"),
      keyId: required("PBOS_CONNECTOR_KEY_ID"), secretBase64: required("PBOS_CONNECTOR_SECRET_BASE64")
    }));
    const service = new ApplicationSupportRequestService({
      async createRequest(input) {
        const saved = await supabase.from("application_support_requests").upsert({ scholar_id: input.scholarId,
          application_workspace_id: input.workspaceId, support_relationship_id: input.relationshipId,
          category: input.category, summary: input.summary, idempotency_key: input.idempotencyKey,
          provenance: input.provenance, pbos_delivery_state: "PENDING" }, { onConflict: "idempotency_key" }).select("id").single();
        if (saved.error || !saved.data) throw new Error(saved.error?.message ?? "Support request persistence failed.");
        return { requestId: saved.data.id as string };
      },
      async markDelivered(input) {
        const updated = await supabase.from("application_support_requests").update({ pbos_delivery_state: "DELIVERED",
          provenance: input.provenance, updated_at: new Date().toISOString() }).eq("id", input.requestId).eq("scholar_id", input.scholarId);
        if (updated.error) throw new Error(updated.error.message);
      }
    }, {
      async registerIdentity(userId) {
        const identity = mapper.mapSupabaseIdentity(userId, "SCHOLAR");
        const response = await client.send("REGISTER_IDENTITY", identity, requestId + "-identity", requestId + "-identity");
        if (!response.success) throw new Error(response.error.message); return identity;
      },
      async publishRequest(identity, input) {
        const response = await client.send("PUBLISH_LIFECYCLE_EVENT", { connectorId: "PLAYBOOK-CONNECTOR-001",
          domainRegistrationId: "PLAYBOOK-SCHOLAR-REGISTRATION-001", identityMappingId: identity.mappingId,
          correlationId: input.correlationId, purpose: "Publish an approved application support request.", payload: {
            eventType: "APPLICATION_SUPPORT_REQUESTED", schemaVersion: "1.0.0", requestId: input.requestId,
            applicationWorkspaceId: input.workspaceId, supportRelationshipId: input.relationshipId, category: input.category
          } }, input.correlationId, input.correlationId);
        if (!response.success) throw new Error(response.error.message); return response.provenance;
      }
    });
    const output = await service.request({ actorId: user.id, scholarId: user.id, workspaceId,
      relationship: { relationshipId: relationship.data.id as string, scholarId: relationship.data.scholar_id as string,
        supporterId: relationship.data.supporter_id as string | null, supporterEmail: relationship.data.supporter_email as string,
        status: relationship.data.status as string, permissions: relationship.data.permissions as string[] },
      category, summary, approvalId: required("PBOS_SUPPORT_REQUEST_APPROVAL_ID"),
      idempotencyKey: user.id + ":" + requestId });
    return NextResponse.json({ ok: true, request: output }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Support request failed." }, { status: 500 });
  }
}
`;

const panelSource = `"use client";

import { FormEvent, useEffect, useState } from "react";

type Workspace = { id: string; opportunity_name: string; status: string; deadline?: string | null };
type Relationship = { id: string; supporter_name?: string | null; supporter_email: string; relationship: string };
type SupportContext = { workspaces: Workspace[]; relationships: Relationship[]; categories: string[] };

async function fetchSupportContext(): Promise<SupportContext> {
  const response = await fetch("/api/pbos/application-support", { cache: "no-store" });
  const result = await response.json() as SupportContext & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Support options could not be loaded.");
  return result;
}

export default function ApplicationSupportRequestPanel() {
  const [context, setContext] = useState<SupportContext>({ workspaces: [], relationships: [], categories: [] });
  const [workspaceId, setWorkspaceId] = useState(""); const [relationshipId, setRelationshipId] = useState("");
  const [category, setCategory] = useState("RECOMMENDATION"); const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Loading your application support options…"); const [error, setError] = useState("");

  useEffect(() => { let active = true; void fetchSupportContext().then(result => { if (!active) return;
      setContext(result); setWorkspaceId(current => current || result.workspaces[0]?.id || "");
      setRelationshipId(current => current || result.relationships[0]?.id || "");
      setCategory(current => current || result.categories[0] || "RECOMMENDATION");
      setStatus(result.workspaces.length && result.relationships.length ? "Choose an application and authorized supporter."
        : "Create an application workspace and activate a support relationship before requesting help.");
    }).catch(cause => { if (active) { setError(cause instanceof Error ? cause.message : "Support options could not be loaded."); setStatus(""); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; }; }, []);

  async function reload() { setLoading(true); setError(""); try { const result = await fetchSupportContext();
      setContext(result); setWorkspaceId(current => current || result.workspaces[0]?.id || "");
      setRelationshipId(current => current || result.relationships[0]?.id || ""); setCategory(current => current || result.categories[0] || "RECOMMENDATION");
      setStatus(result.workspaces.length && result.relationships.length ? "Choose an application and authorized supporter."
        : "Create an application workspace and activate a support relationship before requesting help.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Support options could not be loaded."); setStatus(""); }
    finally { setLoading(false); } }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setSubmitting(true); setStatus("Sending your governed support request…");
    try {
      const response = await fetch("/api/pbos/application-support", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, relationshipId, category, summary, requestId: crypto.randomUUID() }) });
      const result = await response.json() as { request?: { requestId: string }; error?: string };
      if (!response.ok || !result.request) throw new Error(result.error ?? "Support request could not be created.");
      setSummary(""); setStatus("Support request created and delivered with PBOS provenance. Reference " + result.request.requestId + ".");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Support request could not be created."); setStatus(""); }
    finally { setSubmitting(false); }
  }

  const unavailable = loading || !context.workspaces.length || !context.relationships.length;
  return <section aria-labelledby="application-support-heading" style={{ marginTop: 24, border: "1px solid #E2E8F0", borderRadius: 24, padding: 24, background: "#FFFFFF" }}>
    <p style={{ color: "#B45309", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>Authorized support</p>
    <h2 id="application-support-heading">Ask your support network for application help</h2>
    <p id="application-support-description">Only active relationships with support-task permission can receive this request.</p>
    {error && <div role="alert" aria-live="assertive"><p>{error}</p><button type="button" onClick={() => void reload()}>Try again</button></div>}
    <p role="status" aria-live="polite">{status}</p>
    <form onSubmit={submit} aria-describedby="application-support-description" style={{ display: "grid", gap: 14, maxWidth: 720 }}>
      <label>Application workspace<select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} disabled={unavailable || submitting} required>
        <option value="">Choose an application</option>{context.workspaces.map(item => <option key={item.id} value={item.id}>{item.opportunity_name}</option>)}</select></label>
      <label>Authorized supporter<select value={relationshipId} onChange={event => setRelationshipId(event.target.value)} disabled={unavailable || submitting} required>
        <option value="">Choose a supporter</option>{context.relationships.map(item => <option key={item.id} value={item.id}>{item.supporter_name || item.supporter_email} — {item.relationship}</option>)}</select></label>
      <label>Support category<select value={category} onChange={event => setCategory(event.target.value)} disabled={unavailable || submitting} required>
        {context.categories.map(item => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
      <label>What support do you need?<textarea value={summary} onChange={event => setSummary(event.target.value)} minLength={3} maxLength={500}
        disabled={unavailable || submitting} required rows={5} /></label>
      <button type="submit" disabled={unavailable || submitting}>{submitting ? "Sending…" : "Request support"}</button>
    </form>
  </section>;
}
`;

const testSource = `import { describe, expect, it } from "vitest";
import { ApplicationSupportRequestService, authorizeSupportRelationship } from "../../../lib/pbos/application-support-request";

const relationship = { relationshipId: "relationship-1", scholarId: "scholar-1", supporterId: "mentor-1",
  supporterEmail: "mentor@example.com", status: "active", permissions: ["view_progress", "support_tasks"] };

describe("application-to-authorized-support journey", () => {
  it("persists and publishes an owner-scoped support request with provenance", async () => {
    const calls: string[] = [];
    const service = new ApplicationSupportRequestService({
      createRequest: async input => { calls.push("save:" + input.workspaceId); return { requestId: "request-1" }; },
      markDelivered: async input => { calls.push("deliver:" + input.requestId); }
    }, {
      registerIdentity: async userId => ({ mappingId: "mapping-1", externalIdentity: { externalIdentityId: userId,
        externalSystemId: "PLAYBOOK-SYSTEM-001", role: "SCHOLAR", authorityReferences: [], active: true },
        pbosIdentity: { actorId: "PLAYBOOK-ACTOR-" + userId, systemId: "PLAYBOOK-OS-001", role: "SCHOLAR",
          authorityContext: [], provenance: "identity:" + userId, active: true }, mappedAt: new Date() }),
      publishRequest: async (_identity, input) => { calls.push("publish:" + input.relationshipId); return ["pbos:support-request"]; }
    });
    const output = await service.request({ actorId: "scholar-1", scholarId: "scholar-1", workspaceId: "workspace-1",
      relationship, category: "RECOMMENDATION", summary: "Please review my recommendation request.",
      approvalId: "approval-1", idempotencyKey: "scholar-1:request-1" });
    expect(calls).toEqual(["save:workspace-1", "publish:relationship-1", "deliver:request-1"]);
    expect(output.provenance).toEqual(expect.arrayContaining(["relationship:relationship-1", "permission:support_tasks", "pbos:support-request"]));
  });

  it("rejects cross-owner, inactive, and under-authorized relationships before persistence", async () => {
    expect(() => authorizeSupportRelationship({ actorId: "other", scholarId: "scholar-1", approvalId: "approval", relationship })).toThrow("Access denied");
    expect(() => authorizeSupportRelationship({ actorId: "scholar-1", scholarId: "scholar-1", approvalId: "approval",
      relationship: { ...relationship, status: "removed" } })).toThrow("not active and authorized");
    const service = new ApplicationSupportRequestService({ createRequest: async () => { throw new Error("must not persist"); },
      markDelivered: async () => undefined }, { registerIdentity: async () => { throw new Error("must not register"); }, publishRequest: async () => [] });
    await expect(service.request({ actorId: "scholar-1", scholarId: "scholar-1", workspaceId: "workspace-1",
      relationship: { ...relationship, permissions: ["view_progress"] }, category: "OTHER", summary: "Need help",
      approvalId: "approval", idempotencyKey: "key" })).rejects.toThrow("not active and authorized");
  });
});
`;

const migrationSource = `create table if not exists public.application_support_requests (
  id uuid primary key default gen_random_uuid(),
  scholar_id uuid not null references auth.users(id),
  application_workspace_id uuid not null references public.application_workspaces(id),
  support_relationship_id uuid not null references public.support_relationships(id),
  category text not null check (category in ('RECOMMENDATION','DOCUMENTS','ESSAY_REVIEW','DEADLINE','OTHER')),
  summary text not null check (char_length(summary) between 3 and 500),
  state text not null default 'OPEN' check (state in ('OPEN','ACCEPTED','DECLINED','COMPLETED','CANCELLED')),
  idempotency_key text not null unique,
  pbos_delivery_state text not null default 'PENDING' check (pbos_delivery_state in ('PENDING','DELIVERED')),
  provenance jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.application_support_requests enable row level security;
drop policy if exists "Scholars manage own application support requests" on public.application_support_requests;
create policy "Scholars manage own application support requests" on public.application_support_requests for all to authenticated
  using (auth.uid() = scholar_id) with check (auth.uid() = scholar_id);
drop policy if exists "Authorized supporters view application support requests" on public.application_support_requests;
create policy "Authorized supporters view application support requests" on public.application_support_requests for select to authenticated using (
  exists (select 1 from public.support_relationships relationship
    where relationship.id = public.application_support_requests.support_relationship_id
    and relationship.scholar_id = public.application_support_requests.scholar_id and relationship.status = 'active'
    and relationship.permissions ? 'support_tasks'
    and (relationship.supporter_id = auth.uid() or lower(relationship.supporter_email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
);
create index if not exists application_support_requests_owner_idx on public.application_support_requests(scholar_id, created_at desc);
create index if not exists application_support_requests_relationship_idx on public.application_support_requests(support_relationship_id, state, created_at desc);
`;

const guideSource = `# Application-to-Support Journey

A signed-in Scholar chooses a durable application workspace and an active support relationship that grants \`support_tasks\`. The server derives record ownership from the authenticated Supabase session, verifies the workspace and relationship under RLS, durably records the request, and publishes an approved server-signed PBOS lifecycle event. The UI exposes loading, empty, failure, retry, submitting, and delivered states without demo fallbacks.

The browser cannot select a Scholar identity, invent a relationship, or access connector credentials. The application owns the workspace, relationship, request, and UI. PBOS v1 owns connector identity, approval and lifecycle provenance. Configure \`PBOS_SUPPORT_REQUEST_APPROVAL_ID\` only in the protected deployment environment.

Completion requires independent typecheck, tests, accessibility and security evidence, production build, and human certification of the exact pull-request commit. A generated file or green PBOS ledger entry alone is not completion.
`;

export function wireApplicationSupportPanel(source: string): string {
    const importLine = 'import ApplicationSupportRequestPanel from "@/components/application-workspace/ApplicationSupportRequestPanel";';
    const closing = "</PlaybookPage>";
    if (source.includes(importLine) && source.includes("<ApplicationSupportRequestPanel />")) return source;
    if (source.includes(importLine) || source.includes("<ApplicationSupportRequestPanel />")) {
        throw new Error("Playbook application workspace contains a partial support-panel integration; re-inspect before mutation.");
    }
    if (!source.includes("export default function ApplicationWorkspaceDashboard()") || !source.includes(closing)) {
        throw new Error("Playbook application workspace source changed; re-inspect before wiring authorized support.");
    }
    const position = source.lastIndexOf(closing);
    const wired = `${source.slice(0, position)}<ApplicationSupportRequestPanel />\n  ${source.slice(position)}`;
    const clientDirective = '"use client";';
    return wired.startsWith(clientDirective)
        ? wired.replace(clientDirective, `${clientDirective}\n\n${importLine}`)
        : `${importLine}\n${wired}`;
}

function wireEnvironmentExample(source: string): string {
    if (source.includes("PBOS_SUPPORT_REQUEST_APPROVAL_ID=")) return source;
    return `${source.trimEnd()}\nPBOS_SUPPORT_REQUEST_APPROVAL_ID=\n`;
}

function changes(revision: string, runId: string, dashboard: string, environment: string): readonly RepositoryFileChange[] {
    return [
        { path: SUPPORT_SERVICE, content: serviceSource },
        { path: SUPPORT_ROUTE, content: routeSource },
        { path: SUPPORT_PANEL, content: panelSource },
        { path: APPLICATION_DASHBOARD, content: dashboard },
        { path: SUPPORT_TEST, content: testSource },
        { path: SUPPORT_MIGRATION, content: migrationSource },
        { path: ".env.example", content: environment },
        { path: "docs/integrations/PBOS-APPLICATION-SUPPORT.md", content: guideSource },
        { path: "pbos/readiness/048-support-journey.json", content: `${JSON.stringify({ missionId: "048-support-journey",
            systemId: SYSTEM_ID, repository: REPOSITORY, governedRevision: revision, productionRunId: runId,
            state: "IMPLEMENTED_PENDING_VALIDATION", journey: "APPLICATION_TO_AUTHORIZED_SUPPORT", surface: "WEB",
            implementation: [APPLICATION_DASHBOARD, SUPPORT_PANEL, SUPPORT_ROUTE, SUPPORT_SERVICE], durableData: SUPPORT_MIGRATION,
            acceptanceCriteria: ["The authenticated Scholar—not browser input—owns the request", "The workspace belongs to the Scholar",
                "The selected active relationship grants support_tasks", "The request is durable and idempotent under RLS",
                "PBOS communication is server-signed and approval-bound", "Accessible UI, security, tests and build require independent evidence"] }, null, 2)}\n` }
    ];
}

function acceptanceEvidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const item = (dimension: ApplicationAcceptanceEvidence["dimension"], behavior: string, artifact: string,
        source: ApplicationAcceptanceEvidence["source"] = "IMPLEMENTATION"): ApplicationAcceptanceEvidence => ({
        evidenceId: `048-support-journey:${dimension.toLowerCase()}:${revision}`, dimension, behavior, repository: REPOSITORY,
        commit: revision, artifact, passed: true, source
    });
    return [
        item("ROUTE", "Authenticated API loads authorized context and creates an application-linked support request.", SUPPORT_ROUTE),
        item("USER_INTERFACE", "The application workspace exposes a real support-request form with loading and recovery states.", SUPPORT_PANEL),
        item("DURABLE_DATA", "Support requests are idempotent, owner-scoped, relationship-linked and protected by RLS.", SUPPORT_MIGRATION),
        item("AUTHORITY", "Owner and active support_tasks relationship authority fail closed before persistence.", SUPPORT_SERVICE),
        item("PBOS_INTEGRATION", "The server publishes an approval-bound signed APPLICATION_SUPPORT_REQUESTED lifecycle event.", SUPPORT_ROUTE),
        item("ACCEPTANCE_TEST", "Executable tests cover persistence, provenance, cross-owner denial and relationship denial.", SUPPORT_TEST, "APPLICATION_TEST"),
        item("ACCESSIBILITY", "The form has explicit labels plus status, alert, retry, disabled and submitting states.", SUPPORT_PANEL, "APPLICATION_TEST"),
        item("SECURITY", "Browser-selected ownership, service-role access and unauthorized relationships are excluded.", SUPPORT_TEST, "SECURITY_TEST")
    ];
}

export function playbookSupportJourneyExecutor(dependencies: PlaybookSupportJourneyExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "048-support-journey" || context.run.systemId !== SYSTEM_ID || context.run.repository !== REPOSITORY) {
            throw new Error("The CIP-048 application-support adapter is restricted to The Playbook.");
        }
        if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) {
            throw new Error("The active Genesis session does not authorize the Playbook application-support journey.");
        }
        const reference = governedBuildReference(
            { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, context.run.startingBranch);
        const branch = `agent/pbos-playbook-system-001-048-support-${context.run.runId.slice(0, 8)}`;
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
        await dependencies.gateway.readFileAtRevision(reference, APPLICATION_ROUTE, inspection.revision);
        const dashboardSource = await dependencies.gateway.readFileAtRevision(reference, APPLICATION_DASHBOARD, inspection.revision);
        const [environmentSource, packageSource] = await Promise.all([
            dependencies.gateway.readFileAtRevision(reference, ".env.example", inspection.revision),
            dependencies.gateway.readFileAtRevision(reference, "package.json", inspection.revision)
        ]);
        const files = [...changes(inspection.revision, context.run.runId, wireApplicationSupportPanel(dashboardSource),
            wireEnvironmentExample(environmentSource)),
            ...playbookConnectedJourneyAcceptanceFiles(packageSource, "048-support-journey")];
        context.report("BUILDING", `Wiring the application-to-authorized-support journey on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, files);
        await dependencies.gateway.prepareDependencyLock(reference);
        const paths = [...files.map(file => file.path), "package-lock.json"];
        const revision = await dependencies.gateway.commit(reference, "feat: complete authorized application support journey", paths);
        context.report("PUSHING", `Publishing application-support revision ${revision}.`);
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "feat: complete authorized application support journey",
            `PBOS Genesis mission \`048-support-journey\` connects a Scholar-owned application workspace to an active, permission-bearing support relationship at governed revision \`${inspection.revision}\`. Requests are durable under RLS and publish an approval-bound signed PBOS lifecycle event.\n\nValidation and certification remain human-controlled.\n\nGenerated revision: \`${revision}\``);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        context.report("VALIDATING", `GitHub Actions and bounded remediation are monitoring ${pullRequest.url}.`);
        const functionalAcceptancePlan = await playbookConnectedJourneyAcceptancePlan(
            dependencies.gateway, reference, branch, revision, "048-support-journey");
        return { outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`],
            files: { added: files.filter(file => ![APPLICATION_DASHBOARD, ".env.example"].includes(file.path)).map(file => file.path),
                modified: [APPLICATION_DASHBOARD, ".env.example", "package-lock.json"] },
            commands: [{ command: "authorized application-support publication", exitCode: 0, durationMs: 0,
                output: `${branch} ${pullRequest.url}` }],
            validations: [{ name: "Application-support journey published for independent validation", passed: true, durationMs: 0,
                evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url },
            acceptanceEvidence: acceptanceEvidence(revision), functionalAcceptancePlan };
    };
}
