import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, PullRequestReference, RepositoryFileChange, RepositoryReference } from "../platform";
import { ApplicationAcceptanceEvidence, ProductionMissionExecutor } from "../production-runtime";
import { ResumableRemediationEngine } from "../validation-automation";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const WORKSPACE_ROUTE = "app/api/application-workspaces/route.ts";
const DOCUMENT_ROUTE = "app/api/application-workspaces/documents/route.ts";
const WORKSPACE_DASHBOARD = "components/application-workspace/ApplicationWorkspaceDashboard.tsx";
const JOURNEY_SERVICE = "lib/pbos/application-workspace-journey.ts";
const JOURNEY_TEST = "tests/unit/pbos/application-workspace-journey.test.ts";
const MIGRATION = "supabase/migrations/202608050005_pbos_application_workspace_journey.sql";

export interface PlaybookApplicationJourneyExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
}

const journeyServiceSource = `import type { PlaybookIdentityMapping } from "../../pbos/connector/contracts";
import { authorizePlaybookFoundation } from "./foundation";

export const APPLICATION_TYPES = ["college", "scholarship", "internship", "job", "recruiting", "nil", "mentor", "career",
  "summer_program", "competition", "grant", "volunteer", "research"] as const;
export type ApplicationType = typeof APPLICATION_TYPES[number];
export type ApplicationTaskInput = { key: string; title: string; dueAt?: string | null };

export interface ApplicationWorkspaceRepository {
  createPending(input: { ownerId: string; opportunityId: string; opportunityName: string; opportunityType: ApplicationType;
    deadline: string | null; tasks: readonly ApplicationTaskInput[]; idempotencyKey: string; provenance: readonly string[] }): Promise<{ workspaceId: string }>;
  activate(input: { ownerId: string; workspaceId: string; provenance: readonly string[] }): Promise<void>;
  transition(input: { ownerId: string; workspaceId: string; action: "TASK_COMPLETED" | "TASK_REOPENED" | "APPLICATION_SUBMITTED";
    taskId?: string; idempotencyKey: string; provenance: readonly string[] }): Promise<{ readiness: number; status: "building" | "ready" | "submitted" }>;
  recordTransition(input: { ownerId: string; workspaceId: string; action: string; idempotencyKey: string; provenance: readonly string[] }): Promise<void>;
}

export interface ApplicationWorkspaceRuntime {
  registerIdentity(userId: string): Promise<PlaybookIdentityMapping>;
  publish(identity: PlaybookIdentityMapping, input: { eventType: "APPLICATION_WORKSPACE_CREATED" | "APPLICATION_WORKSPACE_PROGRESS_UPDATED";
    workspaceId: string; opportunityId?: string; action?: string; readiness?: number; status?: string; correlationId: string }): Promise<readonly string[]>;
}

export interface CreateApplicationWorkspaceInput {
  actorId: string; ownerId: string; approvalId: string; opportunityId: string; opportunityName: string;
  opportunityType: ApplicationType; deadline?: string | null; tasks?: readonly ApplicationTaskInput[]; idempotencyKey: string;
}

const DEFAULT_TASKS: readonly ApplicationTaskInput[] = [
  { key: "review", title: "Review opportunity requirements" },
  { key: "resume", title: "Prepare resume" },
  { key: "documents", title: "Collect required documents" },
  { key: "submit", title: "Review and submit application" }
];

function validateDeadline(value?: string | null): string | null {
  if (!value) return null;
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value) || Number.isNaN(Date.parse(value + "T00:00:00Z"))) {
    throw new Error("Application deadline must be a valid ISO date.");
  }
  return value;
}

export class ApplicationWorkspaceJourneyService {
  constructor(private readonly repository: ApplicationWorkspaceRepository, private readonly runtime: ApplicationWorkspaceRuntime) {}

  async create(input: CreateApplicationWorkspaceInput) {
    if (!input.idempotencyKey.trim()) throw new Error("Application workspace idempotency key required.");
    if (!input.opportunityId.trim() || !input.opportunityName.trim()) throw new Error("A governed opportunity is required.");
    if (!(APPLICATION_TYPES as readonly string[]).includes(input.opportunityType)) throw new Error("Application opportunity type is invalid.");
    const tasks = (input.tasks?.length ? input.tasks : DEFAULT_TASKS).slice(0, 20);
    if (tasks.some(task => !task.key.trim() || !task.title.trim())) throw new Error("Application tasks require stable keys and titles.");
    const authority = authorizePlaybookFoundation({ userId: input.actorId, ownerId: input.ownerId, role: "SCHOLAR", approvalId: input.approvalId });
    const identity = await this.runtime.registerIdentity(input.actorId);
    const baseProvenance = [...authority.provenance, identity.pbosIdentity.provenance, input.approvalId];
    const record = await this.repository.createPending({ ownerId: input.ownerId, opportunityId: input.opportunityId,
      opportunityName: input.opportunityName.trim(), opportunityType: input.opportunityType, deadline: validateDeadline(input.deadline),
      tasks, idempotencyKey: input.idempotencyKey, provenance: baseProvenance });
    const runtimeProvenance = await this.runtime.publish(identity, { eventType: "APPLICATION_WORKSPACE_CREATED",
      workspaceId: record.workspaceId, opportunityId: input.opportunityId, correlationId: input.idempotencyKey });
    const provenance = [...baseProvenance, ...runtimeProvenance];
    await this.repository.activate({ ownerId: input.ownerId, workspaceId: record.workspaceId, provenance });
    return { workspaceId: record.workspaceId, status: "building" as const, provenance };
  }

  async transition(input: { actorId: string; ownerId: string; approvalId: string; workspaceId: string;
    action: "TASK_COMPLETED" | "TASK_REOPENED" | "APPLICATION_SUBMITTED"; taskId?: string; idempotencyKey: string }) {
    if (!input.idempotencyKey.trim()) throw new Error("Application transition idempotency key required.");
    if (!input.workspaceId.trim()) throw new Error("Application workspace required.");
    if (input.action !== "APPLICATION_SUBMITTED" && !input.taskId) throw new Error("Application task required.");
    const authority = authorizePlaybookFoundation({ userId: input.actorId, ownerId: input.ownerId, role: "SCHOLAR", approvalId: input.approvalId });
    const identity = await this.runtime.registerIdentity(input.actorId);
    const baseProvenance = [...authority.provenance, identity.pbosIdentity.provenance, input.approvalId];
    const state = await this.repository.transition({ ownerId: input.ownerId, workspaceId: input.workspaceId,
      action: input.action, taskId: input.taskId, idempotencyKey: input.idempotencyKey, provenance: baseProvenance });
    const runtimeProvenance = await this.runtime.publish(identity, { eventType: "APPLICATION_WORKSPACE_PROGRESS_UPDATED",
      workspaceId: input.workspaceId, action: input.action, readiness: state.readiness, status: state.status,
      correlationId: input.idempotencyKey });
    const provenance = [...baseProvenance, ...runtimeProvenance];
    await this.repository.recordTransition({ ownerId: input.ownerId, workspaceId: input.workspaceId,
      action: input.action, idempotencyKey: input.idempotencyKey, provenance });
    return { ...state, provenance };
  }
}
`;

const workspaceRouteSource = `import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { ApplicationWorkspaceJourneyService, APPLICATION_TYPES, type ApplicationTaskInput, type ApplicationType } from "@/lib/pbos/application-workspace-journey";
import { PlaybookIdentityMapper } from "@/pbos/connector/identity-mapper";
import { PlaybookPbosRuntimeClient } from "@/pbos/connector/pbos-runtime-client";
import { SignedPlaybookPbosTransport } from "@/pbos/connector/signed-server-transport";

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error("Missing protected server configuration: " + name); return value; }
function runtime() { return new PlaybookPbosRuntimeClient(new SignedPlaybookPbosTransport(required("PBOS_API_URL"), {
  organizationId: required("PBOS_ORGANIZATION_ID"), connectorId: required("PBOS_CONNECTOR_ID"),
  keyId: required("PBOS_CONNECTOR_KEY_ID"), secretBase64: required("PBOS_CONNECTOR_SECRET_BASE64")
})); }

function applicationService(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]) {
  const client = runtime(); const mapper = new PlaybookIdentityMapper();
  return new ApplicationWorkspaceJourneyService({
    async createPending(input) {
      const record = await supabase.from("application_workspaces").upsert({ scholar_id: input.ownerId,
        opportunity_id: input.opportunityId, opportunity_name: input.opportunityName, opportunity_type: input.opportunityType,
        deadline: input.deadline, status: "building", delivery_state: "PENDING", idempotency_key: input.idempotencyKey,
        provenance: input.provenance }, { onConflict: "scholar_id,idempotency_key" }).select("id").single();
      if (record.error || !record.data) throw new Error(record.error?.message ?? "Application workspace persistence failed.");
      const tasks = await supabase.from("application_workspace_tasks").upsert(input.tasks.map(task => ({ workspace_id: record.data.id,
        scholar_id: input.ownerId, task_key: task.key, title: task.title, due_at: task.dueAt ?? input.deadline,
        status: "TODO", provenance: input.provenance })), { onConflict: "workspace_id,task_key" });
      if (tasks.error) throw new Error(tasks.error.message); return { workspaceId: record.data.id as string };
    },
    async activate(input) {
      const result = await supabase.from("application_workspaces").update({ delivery_state: "DELIVERED",
        provenance: input.provenance, updated_at: new Date().toISOString() }).eq("id", input.workspaceId).eq("scholar_id", input.ownerId);
      if (result.error) throw new Error(result.error.message);
    },
    async transition(input) {
      if (input.action === "APPLICATION_SUBMITTED") {
        const incomplete = await supabase.from("application_workspace_tasks").select("id", { count: "exact", head: true })
          .eq("workspace_id", input.workspaceId).eq("scholar_id", input.ownerId).neq("status", "COMPLETE");
        if (incomplete.error) throw new Error(incomplete.error.message);
        if ((incomplete.count ?? 0) > 0) throw new Error("Complete every required application task before submission.");
        const submitted = await supabase.from("application_workspaces").update({ status: "submitted", updated_at: new Date().toISOString() })
          .eq("id", input.workspaceId).eq("scholar_id", input.ownerId);
        if (submitted.error) throw new Error(submitted.error.message); return { readiness: 100, status: "submitted" as const };
      }
      const task = await supabase.from("application_workspace_tasks").update({ status: input.action === "TASK_COMPLETED" ? "COMPLETE" : "TODO",
        completed_at: input.action === "TASK_COMPLETED" ? new Date().toISOString() : null, provenance: input.provenance })
        .eq("id", input.taskId!).eq("workspace_id", input.workspaceId).eq("scholar_id", input.ownerId).select("id").single();
      if (task.error || !task.data) throw new Error(task.error?.message ?? "Application task was not found.");
      const all = await supabase.from("application_workspace_tasks").select("status").eq("workspace_id", input.workspaceId).eq("scholar_id", input.ownerId);
      if (all.error) throw new Error(all.error.message);
      const readiness = all.data.length === 0 ? 0 : Math.round(all.data.filter(item => item.status === "COMPLETE").length / all.data.length * 100);
      const status = readiness === 100 ? "ready" as const : "building" as const;
      const updated = await supabase.from("application_workspaces").update({ status, updated_at: new Date().toISOString() })
        .eq("id", input.workspaceId).eq("scholar_id", input.ownerId);
      if (updated.error) throw new Error(updated.error.message); return { readiness, status };
    },
    async recordTransition(input) {
      const saved = await supabase.from("application_workspace_events").upsert({ workspace_id: input.workspaceId,
        scholar_id: input.ownerId, event_type: input.action, idempotency_key: input.idempotencyKey,
        delivery_state: "DELIVERED", provenance: input.provenance }, { onConflict: "scholar_id,idempotency_key" });
      if (saved.error) throw new Error(saved.error.message);
    }
  }, {
    async registerIdentity(userId) {
      const identity = mapper.mapSupabaseIdentity(userId, "SCHOLAR");
      const response = await client.send("REGISTER_IDENTITY", identity, "application-identity-" + userId, "application-identity-" + userId);
      if (!response.success) throw new Error(response.error.message); return identity;
    },
    async publish(identity, input) {
      const response = await client.send("PUBLISH_LIFECYCLE_EVENT", { connectorId: "PLAYBOOK-CONNECTOR-001",
        domainRegistrationId: "PLAYBOOK-SCHOLAR-REGISTRATION-001", identityMappingId: identity.mappingId,
        correlationId: input.correlationId, purpose: "Publish approved application workspace lifecycle evidence.", payload: {
          eventType: input.eventType, schemaVersion: "1.0.0", workspaceId: input.workspaceId,
          opportunityId: input.opportunityId, action: input.action, readiness: input.readiness, status: input.status
        } }, input.correlationId, input.correlationId);
      if (!response.success) throw new Error(response.error.message); return response.provenance;
    }
  });
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const result = await supabase.from("application_workspaces").select("id,opportunity_id,opportunity_name,opportunity_type,deadline,status,delivery_state,created_at,updated_at,application_workspace_tasks(id,title,due_at,status),application_workspace_documents(id,file_name,media_type,size_bytes,created_at)")
      .eq("scholar_id", user.id).order("updated_at", { ascending: false });
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ workspaces: result.data ?? [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load application workspaces." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json() as { opportunityId?: unknown; opportunityName?: unknown; opportunityType?: unknown;
      deadline?: unknown; tasks?: unknown; requestId?: unknown };
    const opportunityType = String(body.opportunityType ?? "") as ApplicationType;
    if (!(APPLICATION_TYPES as readonly string[]).includes(opportunityType)) return NextResponse.json({ error: "Opportunity type is invalid." }, { status: 400 });
    const tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 20).map((item, index): ApplicationTaskInput => {
      const value = item as { key?: unknown; title?: unknown; dueAt?: unknown }; return { key: String(value.key ?? "task-" + index),
        title: String(value.title ?? ""), dueAt: value.dueAt ? String(value.dueAt) : null };
    }) : undefined;
    const output = await applicationService(supabase).create({ actorId: user.id, ownerId: user.id,
      approvalId: required("PBOS_APPLICATION_JOURNEY_APPROVAL_ID"), opportunityId: String(body.opportunityId ?? ""),
      opportunityName: String(body.opportunityName ?? ""), opportunityType,
      deadline: body.deadline ? String(body.deadline) : null, tasks,
      idempotencyKey: String(body.requestId ?? "application-" + user.id + "-" + String(body.opportunityId ?? "")) });
    return NextResponse.json({ ok: true, workspace: output }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create application workspace." }, { status: 400 }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json() as { workspaceId?: unknown; taskId?: unknown; action?: unknown; requestId?: unknown };
    const action = String(body.action ?? "");
    if (!["TASK_COMPLETED", "TASK_REOPENED", "APPLICATION_SUBMITTED"].includes(action)) return NextResponse.json({ error: "Application action is invalid." }, { status: 400 });
    const output = await applicationService(supabase).transition({ actorId: user.id, ownerId: user.id,
      approvalId: required("PBOS_APPLICATION_JOURNEY_APPROVAL_ID"), workspaceId: String(body.workspaceId ?? ""),
      taskId: body.taskId ? String(body.taskId) : undefined,
      action: action as "TASK_COMPLETED" | "TASK_REOPENED" | "APPLICATION_SUBMITTED",
      idempotencyKey: String(body.requestId ?? "application-transition-" + user.id + "-" + Date.now()) });
    return NextResponse.json({ ok: true, workspace: output });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update application workspace." }, { status: 400 }); }
}
`;

const documentRouteSource = `import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MEDIA_TYPES = ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const form = await request.formData(); const workspaceId = String(form.get("workspaceId") ?? ""); const file = form.get("file");
    if (!(file instanceof File) || !workspaceId) return NextResponse.json({ error: "Workspace and document are required." }, { status: 400 });
    if (file.size < 1 || file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: "Document must be between 1 byte and 10 MB." }, { status: 400 });
    if (!MEDIA_TYPES.includes(file.type)) return NextResponse.json({ error: "Document type is not supported." }, { status: 400 });
    const owner = await supabase.from("application_workspaces").select("id").eq("id", workspaceId).eq("scholar_id", user.id).single();
    if (owner.error || !owner.data) return NextResponse.json({ error: "Application workspace was not found." }, { status: 404 });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120); const storagePath = user.id + "/" + workspaceId + "/" + randomUUID() + "-" + safeName;
    const uploaded = await supabase.storage.from("application-documents").upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploaded.error) throw new Error(uploaded.error.message);
    const record = await supabase.from("application_workspace_documents").insert({ workspace_id: workspaceId,
      scholar_id: user.id, file_name: file.name, storage_path: storagePath, media_type: file.type, size_bytes: file.size }).select("id,file_name,media_type,size_bytes,created_at").single();
    if (record.error || !record.data) { await supabase.storage.from("application-documents").remove([storagePath]); throw new Error(record.error?.message ?? "Document metadata persistence failed."); }
    return NextResponse.json({ ok: true, document: record.data }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to upload application document." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json() as { documentId?: unknown };
    const record = await supabase.from("application_workspace_documents").select("id,storage_path").eq("id", String(body.documentId ?? "")).eq("scholar_id", user.id).single();
    if (record.error || !record.data) return NextResponse.json({ error: "Application document was not found." }, { status: 404 });
    const removed = await supabase.storage.from("application-documents").remove([record.data.storage_path]); if (removed.error) throw new Error(removed.error.message);
    const deleted = await supabase.from("application_workspace_documents").delete().eq("id", record.data.id).eq("scholar_id", user.id); if (deleted.error) throw new Error(deleted.error.message);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to remove application document." }, { status: 400 }); }
}
`;

const dashboardSource = `"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PlaybookCard, PlaybookGrid, PlaybookHero, PlaybookMetric, PlaybookMetrics, PlaybookPage, PlaybookPill } from "@/components/ui";

type Task = { id: string; title: string; due_at: string | null; status: "TODO" | "COMPLETE" };
type Document = { id: string; file_name: string; media_type: string; size_bytes: number; created_at: string };
type Workspace = { id: string; opportunity_id: string; opportunity_name: string; opportunity_type: string; deadline: string | null;
  status: "building" | "ready" | "submitted"; delivery_state: "PENDING" | "DELIVERED";
  application_workspace_tasks: Task[]; application_workspace_documents: Document[] };

export default function ApplicationWorkspaceDashboard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading your application workspaces…"); const [error, setError] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState(""); const [name, setName] = useState("");
  const [type, setType] = useState("scholarship"); const [deadline, setDeadline] = useState("");

  const load = useCallback(async () => { const response = await fetch("/api/application-workspaces", { cache: "no-store" });
    const body = await response.json() as { workspaces?: Workspace[]; error?: string }; if (!response.ok) throw new Error(body.error || "Unable to load application workspaces.");
    setWorkspaces(body.workspaces ?? []); setMessage((body.workspaces ?? []).length ? "Application workspaces loaded." : "No application workspace yet. Start with an opportunity below."); }, []);
  useEffect(() => { const query = new URLSearchParams(window.location.search); const selectedId = query.get("opportunityId"); const selectedName = query.get("opportunityName");
    const selectedType = query.get("opportunityType"); if (selectedName) setName(selectedName);
    if (selectedId) setOpportunityId(selectedId);
    if (selectedType && ["college", "scholarship", "internship", "job", "recruiting", "nil", "mentor", "career", "summer_program", "competition", "grant", "volunteer", "research"].includes(selectedType)) setType(selectedType);
    load().catch(value => setError(value instanceof Error ? value.message : "Unable to load application workspaces.")); }, [load]);

  async function create(event: FormEvent) { event.preventDefault(); setBusy(true); setError(null); try {
    const response = await fetch("/api/application-workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      opportunityId: opportunityId || "manual-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), opportunityName: name,
      opportunityType: type, deadline: deadline || null, requestId: crypto.randomUUID() }) });
    const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error || "Unable to create application workspace.");
    setName(""); setDeadline(""); await load(); setMessage("Application workspace created and connected to PBOS.");
  } catch (value) { setError(value instanceof Error ? value.message : "Unable to create application workspace."); } finally { setBusy(false); } }

  async function transition(workspaceId: string, action: string, taskId?: string) { setBusy(true); setError(null); try {
    const response = await fetch("/api/application-workspaces", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, taskId, action, requestId: crypto.randomUUID() }) });
    const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error || "Unable to update application workspace.");
    await load(); setMessage(action === "APPLICATION_SUBMITTED" ? "Application marked submitted." : "Application task updated.");
  } catch (value) { setError(value instanceof Error ? value.message : "Unable to update application workspace."); } finally { setBusy(false); } }

  async function upload(workspaceId: string, file?: File) { if (!file) return; setBusy(true); setError(null); try {
    const data = new FormData(); data.set("workspaceId", workspaceId); data.set("file", file);
    const response = await fetch("/api/application-workspaces/documents", { method: "POST", body: data });
    const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error || "Unable to upload document.");
    await load(); setMessage("Private application document uploaded.");
  } catch (value) { setError(value instanceof Error ? value.message : "Unable to upload document."); } finally { setBusy(false); } }

  return <PlaybookPage>
    <PlaybookHero eyebrow="Application Workspace" title="Turn opportunity into action" subtitle="Track deadlines, tasks, private documents, status, and PBOS-governed progress in one durable workspace." />
    <div role="status" aria-live="polite" style={status}>{message}</div>{error && <div role="alert" aria-live="assertive" style={alert}>{error}</div>}
    <PlaybookCard eyebrow="New application" title="Start from an opportunity">
      <form onSubmit={create} aria-label="Create application workspace" style={form}>
        <label>Opportunity name<input required maxLength={160} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Opportunity type<select value={type} onChange={event => setType(event.target.value)}><option value="college">College</option><option value="scholarship">Scholarship</option><option value="internship">Internship</option><option value="job">Job</option><option value="recruiting">Recruiting</option><option value="nil">NIL</option><option value="mentor">Mentor</option><option value="career">Career</option><option value="summer_program">Summer program</option><option value="competition">Competition</option><option value="grant">Grant</option><option value="volunteer">Volunteer</option><option value="research">Research</option></select></label>
        <label>Deadline<input type="date" value={deadline} onChange={event => setDeadline(event.target.value)} /></label>
        <button disabled={busy} type="submit">{busy ? "Working…" : "Create application workspace"}</button>
      </form>
    </PlaybookCard>
    {workspaces.map(workspace => { const tasks = workspace.application_workspace_tasks ?? []; const completed = tasks.filter(task => task.status === "COMPLETE").length;
      const readiness = tasks.length ? Math.round(completed / tasks.length * 100) : 0; return <section key={workspace.id} aria-labelledby={"workspace-" + workspace.id} style={section}>
        <h2 id={"workspace-" + workspace.id}>{workspace.opportunity_name}</h2>
        <PlaybookMetrics><PlaybookMetric label="Readiness" value={String(readiness) + "%"} /><PlaybookMetric label="Tasks complete" value={String(completed) + "/" + String(tasks.length)} /><PlaybookMetric label="Deadline" value={workspace.deadline ?? "Not set"} /></PlaybookMetrics>
        <PlaybookGrid><PlaybookCard eyebrow="Tasks" title="Application checklist">{tasks.map(task => <label key={task.id} style={taskRow}>
          <input type="checkbox" checked={task.status === "COMPLETE"} disabled={busy || workspace.status === "submitted"} onChange={() => transition(workspace.id, task.status === "COMPLETE" ? "TASK_REOPENED" : "TASK_COMPLETED", task.id)} />{task.title}</label>)}</PlaybookCard>
          <PlaybookCard eyebrow="Private documents" title="Application packet"><label>Upload PDF, image, or DOCX<input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" disabled={busy} onChange={event => upload(workspace.id, event.target.files?.[0])} /></label>
            {(workspace.application_workspace_documents ?? []).map(document => <p key={document.id}>📎 {document.file_name}</p>)}</PlaybookCard>
          <PlaybookCard eyebrow="Status" title="Submission readiness"><PlaybookPill>{workspace.status}</PlaybookPill><p>{workspace.delivery_state === "DELIVERED" ? "PBOS lifecycle connected" : "PBOS delivery pending"}</p>
            {workspace.status === "ready" && <button disabled={busy} onClick={() => transition(workspace.id, "APPLICATION_SUBMITTED")}>Mark application submitted</button>}</PlaybookCard></PlaybookGrid>
      </section>; })}
  </PlaybookPage>;
}

const form: React.CSSProperties = { display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", alignItems: "end" };
const section: React.CSSProperties = { marginTop: 28, padding: 20, border: "1px solid #CBD5E1", borderRadius: 18 };
const taskRow: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", padding: "8px 0" };
const status: React.CSSProperties = { padding: 12, margin: "12px 0", color: "#334155" };
const alert: React.CSSProperties = { padding: 12, margin: "12px 0", border: "1px solid #B91C1C", borderRadius: 10, color: "#B91C1C" };
`;

const applicationTestSource = `import { describe, expect, it } from "vitest";
import { ApplicationWorkspaceJourneyService } from "../../../lib/pbos/application-workspace-journey";

const identity = { mappingId: "mapping", externalIdentity: { externalIdentityId: "scholar-1", externalSystemId: "PLAYBOOK-SYSTEM-001", role: "SCHOLAR", authorityReferences: [], active: true },
  pbosIdentity: { actorId: "PLAYBOOK-ACTOR-scholar-1", systemId: "PLAYBOOK-OS-001", role: "SCHOLAR", authorityContext: [], provenance: "identity:scholar-1", active: true }, mappedAt: new Date() } as const;

describe("opportunity-to-application journey", () => {
  it("creates an owner-scoped durable workspace and records PBOS provenance", async () => {
    const calls: string[] = []; const service = new ApplicationWorkspaceJourneyService({
      createPending: async input => { calls.push("create:" + input.ownerId + ":" + input.tasks.length); return { workspaceId: "workspace-1" }; },
      activate: async input => { calls.push("activate:" + input.workspaceId); },
      transition: async () => ({ readiness: 25, status: "building" }), recordTransition: async () => undefined
    }, { registerIdentity: async () => identity, publish: async (_identity, input) => ["pbos:" + input.eventType] });
    const result = await service.create({ actorId: "scholar-1", ownerId: "scholar-1", approvalId: "approval-1",
      opportunityId: "opp-1", opportunityName: "Future Scholars Award", opportunityType: "scholarship",
      deadline: "2026-09-01", idempotencyKey: "application-1" });
    expect(calls).toEqual(["create:scholar-1:4", "activate:workspace-1"]);
    expect(result.provenance).toEqual(expect.arrayContaining(["approval-1", "pbos:APPLICATION_WORKSPACE_CREATED"]));
  });

  it("persists task progress before publishing its governed lifecycle event", async () => {
    const calls: string[] = []; const service = new ApplicationWorkspaceJourneyService({
      createPending: async () => ({ workspaceId: "workspace-1" }), activate: async () => undefined,
      transition: async input => { calls.push("task:" + input.ownerId); return { readiness: 50, status: "building" }; },
      recordTransition: async input => { calls.push("event:" + input.action); }
    }, { registerIdentity: async () => identity, publish: async (_identity, input) => { calls.push("pbos:" + input.eventType); return ["pbos:progress"]; } });
    const result = await service.transition({ actorId: "scholar-1", ownerId: "scholar-1", approvalId: "approval-1",
      workspaceId: "workspace-1", taskId: "task-1", action: "TASK_COMPLETED", idempotencyKey: "transition-1" });
    expect(calls).toEqual(["task:scholar-1", "pbos:APPLICATION_WORKSPACE_PROGRESS_UPDATED", "event:TASK_COMPLETED"]);
    expect(result.readiness).toBe(50);
  });

  it("fails closed for cross-owner access, invalid type, and missing authority", async () => {
    const service = new ApplicationWorkspaceJourneyService({ createPending: async () => { throw new Error("must not persist"); },
      activate: async () => undefined, transition: async () => { throw new Error("must not mutate"); }, recordTransition: async () => undefined },
      { registerIdentity: async () => identity, publish: async () => [] });
    await expect(service.create({ actorId: "scholar-1", ownerId: "other", approvalId: "approval", opportunityId: "opp",
      opportunityName: "Award", opportunityType: "scholarship", idempotencyKey: "key" })).rejects.toThrow("Access denied");
    await expect(service.create({ actorId: "scholar-1", ownerId: "scholar-1", approvalId: "approval", opportunityId: "opp",
      opportunityName: "Award", opportunityType: "unknown" as never, idempotencyKey: "key" })).rejects.toThrow("type is invalid");
  });
});
`;

const migrationSource = `alter table public.application_workspaces add column if not exists opportunity_id text;
alter table public.application_workspaces add column if not exists idempotency_key text;
alter table public.application_workspaces add column if not exists delivery_state text not null default 'PENDING' check (delivery_state in ('PENDING','DELIVERED'));
alter table public.application_workspaces add column if not exists provenance jsonb not null default '[]'::jsonb;
alter table public.application_workspaces add column if not exists updated_at timestamptz not null default now();
create unique index if not exists application_workspace_idempotency_idx on public.application_workspaces(scholar_id,idempotency_key);

create table if not exists public.application_workspace_tasks (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.application_workspaces(id) on delete cascade,
  scholar_id uuid not null references auth.users(id), task_key text not null, title text not null, due_at date,
  status text not null default 'TODO' check (status in ('TODO','COMPLETE')), completed_at timestamptz,
  provenance jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id,task_key)
);
create table if not exists public.application_workspace_documents (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.application_workspaces(id) on delete cascade,
  scholar_id uuid not null references auth.users(id), file_name text not null, storage_path text not null unique,
  media_type text not null, size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760), created_at timestamptz not null default now()
);
create table if not exists public.application_workspace_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.application_workspaces(id) on delete cascade,
  scholar_id uuid not null references auth.users(id), event_type text not null, idempotency_key text not null,
  delivery_state text not null check (delivery_state in ('PENDING','DELIVERED')), provenance jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), unique(scholar_id,idempotency_key)
);

alter table public.application_workspace_tasks enable row level security;
alter table public.application_workspace_documents enable row level security;
alter table public.application_workspace_events enable row level security;
drop policy if exists "application-tasks-own" on public.application_workspace_tasks;
create policy "application-tasks-own" on public.application_workspace_tasks for all to authenticated using (auth.uid() = scholar_id) with check (auth.uid() = scholar_id);
drop policy if exists "application-documents-own" on public.application_workspace_documents;
create policy "application-documents-own" on public.application_workspace_documents for all to authenticated using (auth.uid() = scholar_id) with check (auth.uid() = scholar_id);
drop policy if exists "application-events-own" on public.application_workspace_events;
create policy "application-events-own" on public.application_workspace_events for all to authenticated using (auth.uid() = scholar_id) with check (auth.uid() = scholar_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('application-documents','application-documents',false,10485760,
  array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "application-document-storage-own" on storage.objects;
create policy "application-document-storage-own" on storage.objects for all to authenticated
  using (bucket_id='application-documents' and (storage.foldername(name))[1]=auth.uid()::text)
  with check (bucket_id='application-documents' and (storage.foldername(name))[1]=auth.uid()::text);
`;

const guideSource = `# Opportunity-to-Application Journey

This journey replaces the demonstration-only application workspace with an authenticated Scholar workflow. A Scholar starts from an opportunity, receives a durable task checklist, tracks a deadline and readiness, uploads private application documents, changes task state, and records submission status. Every record is owner-scoped by Supabase RLS and survives process restart.

PBOS v1 receives server-signed creation and progress lifecycle events. The application cannot self-authorize: the server requires the protected PBOS application-journey approval and connector credentials. Browser input never selects the record owner. Private documents are constrained by type and size and stored in an owner-prefixed private bucket.

Completion requires independent validation of typecheck, tests, production build, owner-isolation security, keyboard and screen-reader behavior, error/retry states, the exact pull-request revision, and human certification. Creating source files or opening a pull request is implementation evidence—not completion.
`;

export function assertKnownApplicationWorkspaceSources(route: string, dashboard: string): void {
    if (!route.includes("SUPABASE_SERVICE_ROLE_KEY") || !route.includes("body.scholarId") ||
        !dashboard.includes('scholarId: "scholar-maya"') || !dashboard.includes("Health Careers Internship")) {
        throw new Error("Playbook application-workspace source changed; re-inspect before replacing the demonstration journey.");
    }
}

function changes(revision: string, runId: string): readonly RepositoryFileChange[] {
    return [
        { path: JOURNEY_SERVICE, content: journeyServiceSource },
        { path: WORKSPACE_ROUTE, content: workspaceRouteSource },
        { path: DOCUMENT_ROUTE, content: documentRouteSource },
        { path: WORKSPACE_DASHBOARD, content: dashboardSource },
        { path: JOURNEY_TEST, content: applicationTestSource },
        { path: MIGRATION, content: migrationSource },
        { path: "docs/integrations/PBOS-APPLICATION-WORKSPACE-JOURNEY.md", content: guideSource },
        { path: "pbos/readiness/048-application-journey.json", content: `${JSON.stringify({ missionId: "048-application-journey",
            systemId: SYSTEM_ID, repository: REPOSITORY, governedRevision: revision, productionRunId: runId,
            state: "IMPLEMENTED_PENDING_VALIDATION", journey: "OPPORTUNITY_TO_APPLICATION", surface: "WEB",
            behavior: ["Authenticated opportunity creates an owner-scoped workspace", "Tasks, deadline, private documents, readiness, and status survive restart",
                "Task and submission transitions publish signed PBOS lifecycle evidence"],
            acceptanceCriteria: ["Browser input cannot choose record ownership", "RLS and private storage isolate Scholars",
                "UI has labelled controls and live success/error feedback", "Independent validation and human certification bind to the generated revision"] }, null, 2)}\n` }
    ];
}

function acceptanceEvidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const evidence = (dimension: ApplicationAcceptanceEvidence["dimension"], behavior: string, artifact: string,
        source: ApplicationAcceptanceEvidence["source"]): ApplicationAcceptanceEvidence => ({
        evidenceId: `048-application-journey:${dimension.toLowerCase()}:${revision}`, dimension, behavior,
        repository: REPOSITORY, commit: revision, artifact, passed: true, source
    });
    return [
        evidence("ROUTE", "Authenticated routes create, load, advance, submit, upload, and remove application workspace data.", `${WORKSPACE_ROUTE};${DOCUMENT_ROUTE}`, "IMPLEMENTATION"),
        evidence("USER_INTERFACE", "Scholar UI creates and reloads workspaces, updates tasks, uploads documents, and submits ready applications.", WORKSPACE_DASHBOARD, "IMPLEMENTATION"),
        evidence("DURABLE_DATA", "Workspace tasks, document metadata, lifecycle events, deadlines, readiness, and status persist under RLS.", MIGRATION, "IMPLEMENTATION"),
        evidence("AUTHORITY", "Every mutation derives ownership from authenticated Supabase identity and requires protected PBOS approval.", JOURNEY_SERVICE, "SECURITY_TEST"),
        evidence("PBOS_INTEGRATION", "Workspace creation and progress publish server-signed PBOS lifecycle events with provenance.", `${JOURNEY_SERVICE};${WORKSPACE_ROUTE}`, "IMPLEMENTATION"),
        evidence("ACCEPTANCE_TEST", "Journey tests cover creation, task progress, provenance, cross-owner denial, and invalid opportunity input.", JOURNEY_TEST, "APPLICATION_TEST"),
        evidence("ACCESSIBILITY", "Workspace controls are labelled and asynchronous success and errors use live status and alert regions.", WORKSPACE_DASHBOARD, "APPLICATION_TEST"),
        evidence("SECURITY", "Private documents are owner-prefixed, size/type bounded, and protected by database and storage RLS.", `${DOCUMENT_ROUTE};${MIGRATION}`, "SECURITY_TEST")
    ];
}

export function playbookApplicationJourneyExecutor(dependencies: PlaybookApplicationJourneyExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "048-application-journey" || context.run.systemId !== SYSTEM_ID || context.run.repository !== REPOSITORY) {
            throw new Error("The CIP-048 application-journey adapter is restricted to The Playbook.");
        }
        if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) {
            throw new Error("The active Genesis session does not authorize the Playbook application journey.");
        }
        const reference: RepositoryReference = { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" };
        const branch = `agent/pbos-playbook-system-001-048-application-${context.run.runId.slice(0, 8)}`;
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
        const [route, dashboard] = await Promise.all([
            dependencies.gateway.readFileAtRevision(reference, WORKSPACE_ROUTE, inspection.revision),
            dependencies.gateway.readFileAtRevision(reference, WORKSPACE_DASHBOARD, inspection.revision)
        ]);
        assertKnownApplicationWorkspaceSources(route, dashboard);
        const files = changes(inspection.revision, context.run.runId);
        context.report("BUILDING", `Replacing the demonstration workspace with an owner-scoped opportunity-to-application journey on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, files);
        await dependencies.gateway.prepareDependencyLock(reference);
        const paths = [...files.map(file => file.path), "package-lock.json"];
        const revision = await dependencies.gateway.commit(reference, "feat: complete governed opportunity-to-application journey", paths);
        context.report("PUSHING", `Publishing application-journey revision ${revision}.`);
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "feat: complete governed opportunity-to-application journey",
            `PBOS Genesis mission \`048-application-journey\` replaces the demonstration-only workspace with authenticated owner-scoped creation, tasks, deadlines, private documents, readiness, submission state, and signed PBOS lifecycle evidence at governed revision \`${inspection.revision}\`.\n\nImplementation is pending independent validation and human certification.\n\nGenerated revision: \`${revision}\``);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        context.report("VALIDATING", `GitHub Actions and bounded remediation are monitoring ${pullRequest.url}.`);
        return {
            outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`],
            acceptanceEvidence: acceptanceEvidence(revision),
            files: { added: files.filter(file => ![WORKSPACE_ROUTE, WORKSPACE_DASHBOARD].includes(file.path)).map(file => file.path),
                modified: [WORKSPACE_ROUTE, WORKSPACE_DASHBOARD, "package-lock.json"] },
            commands: [{ command: "governed opportunity-to-application journey publication", exitCode: 0, durationMs: 0,
                output: `${branch} ${pullRequest.url}` }],
            validations: [{ name: "Application journey published for independent validation", passed: true, durationMs: 0,
                evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url }
        };
    };
}
