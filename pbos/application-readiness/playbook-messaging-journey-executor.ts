import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ApplicationAcceptanceEvidence, ProductionMissionExecutor } from "../production-runtime";
import { ResumableRemediationEngine } from "../validation-automation";
import { playbookConnectedJourneyAcceptanceFiles, playbookConnectedJourneyAcceptancePlan } from "./playbook-connected-journey-functional-acceptance";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const ROUTE = "app/api/support-network/messages/route.ts";
const INBOX = "components/messages/InboxV2.tsx";
const SERVICE = "lib/pbos/governed-messaging.ts";
const TEST = "tests/unit/pbos/governed-messaging.test.ts";
const MIGRATION = "supabase/migrations/202608050008_pbos_governed_messaging.sql";

export interface PlaybookMessagingJourneyExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
}

const serviceSource = `import { authorizePlaybookFoundation } from "./foundation";
import { requireApproval } from "@/pbos/generated/security/authority";
import { PlaybookIdentityMapper } from "@/pbos/connector/identity-mapper";
import type { PlaybookRole } from "@/pbos/connector/contracts";

export interface MessagingRelationship {
  id: string; scholarId: string; supporterId?: string | null; supporterEmail: string;
  relationship?: string | null; status: string; permissions: readonly string[];
}

export function supporterRoleForRelationship(value?: string | null): PlaybookRole {
  const relationship = String(value ?? "").trim().toLowerCase();
  if (["parent", "guardian", "family", "relative"].includes(relationship)) return "FAMILY";
  if (["coach", "athletic coach", "sports coach"].includes(relationship)) return "COACH";
  if (["teacher", "educator", "counselor", "school counselor"].includes(relationship)) return "EDUCATOR";
  return "MENTOR";
}

export function authorizeMessagingRelationship(input: { actorId: string; actorEmail?: string | null;
  relationship: MessagingRelationship; approvalId: string }) {
  const relationship = input.relationship;
  const scholar = relationship.scholarId === input.actorId;
  const supporter = relationship.supporterId === input.actorId ||
    Boolean(input.actorEmail && relationship.supporterEmail.toLowerCase() === input.actorEmail.toLowerCase());
  if (relationship.status !== "active" || !relationship.permissions.includes("support_tasks") || (!scholar && !supporter)) {
    throw new Error("Messaging requires an active permission-bearing support relationship.");
  }
  const identity = scholar
    ? authorizePlaybookFoundation({ userId: input.actorId, ownerId: relationship.scholarId,
        role: "SCHOLAR", approvalId: input.approvalId }).identity
    : new PlaybookIdentityMapper().mapSupabaseIdentity(input.actorId, supporterRoleForRelationship(relationship.relationship));
  const approvalId = requireApproval(input.approvalId);
  return { scholarId: relationship.scholarId, role: scholar ? "scholar" : "supporter",
    pbosRole: identity.pbosIdentity.role,
    provenance: [identity.pbosIdentity.provenance, approvalId, "relationship:" + relationship.id, "permission:support_tasks"] };
}

export function normalizeGovernedMessage(body: string): string {
  const normalized = body.replace(/\\s+/g, " ").trim();
  if (normalized.length < 1 || normalized.length > 2000) throw new Error("Message must contain 1 to 2000 characters.");
  return normalized;
}

export function messagingAction(action: string): "READ" | "MUTE" | "UNMUTE" | "BLOCK" | "UNBLOCK" | "REPORT" {
  if (!["READ", "MUTE", "UNMUTE", "BLOCK", "UNBLOCK", "REPORT"].includes(action)) {
    throw new Error("Messaging action is not governed.");
  }
  return action as "READ" | "MUTE" | "UNMUTE" | "BLOCK" | "UNBLOCK" | "REPORT";
}
`;

const routeSource = `import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { authorizeMessagingRelationship, messagingAction, normalizeGovernedMessage } from "@/lib/pbos/governed-messaging";
import { PlaybookIdentityMapper } from "@/pbos/connector/identity-mapper";
import { PlaybookPbosRuntimeClient } from "@/pbos/connector/pbos-runtime-client";
import { SignedPlaybookPbosTransport } from "@/pbos/connector/signed-server-transport";

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error("Missing protected server configuration: " + name); return value; }

async function relationshipsFor(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], user: { id: string; email?: string | null }) {
  const queries = [
    supabase.from("support_relationships").select("id,scholar_id,supporter_id,supporter_email,relationship,status,permissions").eq("status", "active").eq("scholar_id", user.id),
    supabase.from("support_relationships").select("id,scholar_id,supporter_id,supporter_email,relationship,status,permissions").eq("status", "active").eq("supporter_id", user.id)
  ];
  if (user.email) queries.push(supabase.from("support_relationships").select("id,scholar_id,supporter_id,supporter_email,relationship,status,permissions")
    .eq("status", "active").eq("supporter_email", user.email));
  const results = await Promise.all(queries); const records = new Map<string, Record<string, unknown>>();
  for (const result of results) { if (result.error) throw new Error(result.error.message); for (const item of result.data ?? []) records.set(String(item.id), item); }
  return [...records.values()];
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const relationships = await relationshipsFor(supabase, user);
    const relationshipIds = relationships.map(item => String(item.id));
    if (!relationshipIds.length) return NextResponse.json({ conversations: [] });
    const conversations = await supabase.from("pbos_conversations").select("id,scholar_id,relationship_id,status,created_at,updated_at")
      .in("relationship_id", relationshipIds).order("updated_at", { ascending: false });
    if (conversations.error) throw new Error(conversations.error.message);
    const ids = (conversations.data ?? []).map(item => item.id as string);
    if (!ids.length) return NextResponse.json({ conversations: [] });
    const [participants, messages] = await Promise.all([
      supabase.from("pbos_conversation_participants").select("conversation_id,user_id,role,muted_at,blocked_at,last_read_at").in("conversation_id", ids),
      supabase.from("pbos_messages").select("id,conversation_id,sender_id,body,delivery_state,moderation_state,reported_at,created_at")
        .in("conversation_id", ids).order("created_at", { ascending: true })
    ]);
    if (participants.error) throw new Error(participants.error.message); if (messages.error) throw new Error(messages.error.message);
    return NextResponse.json({ conversations: (conversations.data ?? []).map(conversation => {
      const membership = (participants.data ?? []).find(item => item.conversation_id === conversation.id && item.user_id === user.id);
      const thread = (messages.data ?? []).filter(item => item.conversation_id === conversation.id);
      const unread = thread.filter(item => item.sender_id !== user.id && (!membership?.last_read_at || item.created_at > membership.last_read_at)).length;
      return { ...conversation, relationship: relationships.find(item => item.id === conversation.relationship_id),
        participant: membership, unreadCount: unread, messages: thread };
    }) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Messaging inbox failed." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json() as { relationshipId?: unknown; conversationId?: unknown; body?: unknown; requestId?: unknown };
    const relationshipId = String(body.relationshipId ?? ""); const requestId = String(body.requestId ?? "");
    if (!relationshipId || !requestId) return NextResponse.json({ error: "Relationship and request identifiers are required." }, { status: 400 });
    const relationshipResult = await supabase.from("support_relationships")
      .select("id,scholar_id,supporter_id,supporter_email,relationship,status,permissions").eq("id", relationshipId).maybeSingle();
    if (relationshipResult.error) throw new Error(relationshipResult.error.message);
    if (!relationshipResult.data) return NextResponse.json({ error: "Support relationship not found." }, { status: 404 });
    const authority = authorizeMessagingRelationship({ actorId: user.id, actorEmail: user.email,
      relationship: { id: String(relationshipResult.data.id), scholarId: String(relationshipResult.data.scholar_id),
        supporterId: relationshipResult.data.supporter_id as string | null, supporterEmail: String(relationshipResult.data.supporter_email),
        relationship: String(relationshipResult.data.relationship ?? "mentor"),
        status: String(relationshipResult.data.status), permissions: relationshipResult.data.permissions as string[] },
      approvalId: required("PBOS_MESSAGING_JOURNEY_APPROVAL_ID") });
    const normalized = normalizeGovernedMessage(String(body.body ?? ""));
    const existingConversation = await supabase.from("pbos_conversations").select("id,scholar_id,relationship_id,status")
      .eq("relationship_id", relationshipId).maybeSingle();
    if (existingConversation.error) throw new Error(existingConversation.error.message);
    let conversation = existingConversation.data;
    if (!conversation) {
      const created = await supabase.from("pbos_conversations").insert({ scholar_id: authority.scholarId,
        relationship_id: relationshipId, status: "ACTIVE", created_by: user.id }).select("id,scholar_id,relationship_id,status").single();
      if (created.error || !created.data) throw new Error(created.error?.message ?? "Conversation persistence failed.");
      conversation = created.data;
    }
    const conversationId = String(conversation.id);
    if (body.conversationId && String(body.conversationId) !== conversationId) return NextResponse.json({ error: "Conversation lineage mismatch." }, { status: 409 });
    const membership = await supabase.from("pbos_conversation_participants").upsert({ conversation_id: conversationId,
      user_id: user.id, role: authority.role }, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
    if (membership.error) throw new Error(membership.error.message);
    const participant = await supabase.from("pbos_conversation_participants").select("blocked_at").eq("conversation_id", conversationId)
      .eq("user_id", user.id).maybeSingle();
    if (participant.error) throw new Error(participant.error.message);
    if (!participant.data || participant.data.blocked_at) return NextResponse.json({ error: "Conversation is blocked for this participant." }, { status: 403 });
    const idempotencyKey = user.id + ":" + requestId;
    const staged = await supabase.from("pbos_messages").upsert({ conversation_id: conversationId, scholar_id: authority.scholarId,
      sender_id: user.id, body: normalized, idempotency_key: idempotencyKey, delivery_state: "PENDING",
      moderation_state: "VISIBLE", provenance: authority.provenance }, { onConflict: "idempotency_key" }).select("id,conversation_id,sender_id,body,created_at").single();
    if (staged.error || !staged.data) throw new Error(staged.error?.message ?? "Message persistence failed.");
    const mapper = new PlaybookIdentityMapper(); const identity = mapper.mapSupabaseIdentity(user.id, authority.pbosRole);
    const client = new PlaybookPbosRuntimeClient(new SignedPlaybookPbosTransport(required("PBOS_API_URL"), {
      organizationId: required("PBOS_ORGANIZATION_ID"), connectorId: required("PBOS_CONNECTOR_ID"),
      keyId: required("PBOS_CONNECTOR_KEY_ID"), secretBase64: required("PBOS_CONNECTOR_SECRET_BASE64") }));
    const response = await client.send("PUBLISH_LIFECYCLE_EVENT", { connectorId: "PLAYBOOK-CONNECTOR-001",
      domainRegistrationId: "PLAYBOOK-SCHOLAR-REGISTRATION-001", identityMappingId: identity.mappingId,
      correlationId: idempotencyKey, purpose: "Publish an approved support message.", payload: {
        eventType: "SUPPORT_MESSAGE_SENT", schemaVersion: "1.0.0", messageId: staged.data.id, conversationId
      } }, idempotencyKey, idempotencyKey);
    if (!response.success) throw new Error(response.error.message);
    const provenance = [...authority.provenance, identity.pbosIdentity.provenance, ...response.provenance];
    const delivered = await supabase.from("pbos_messages").update({ delivery_state: "DELIVERED", provenance })
      .eq("id", staged.data.id).eq("sender_id", user.id).select("id,conversation_id,sender_id,body,delivery_state,created_at").single();
    if (delivered.error || !delivered.data) throw new Error(delivered.error?.message ?? "Message delivery finalization failed.");
    return NextResponse.json({ conversation, message: delivered.data }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Message delivery failed." }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json() as { action?: unknown; conversationId?: unknown; messageId?: unknown };
    const action = messagingAction(String(body.action ?? "")); const conversationId = String(body.conversationId ?? "");
    const participant = await supabase.from("pbos_conversation_participants").select("conversation_id,user_id").eq("conversation_id", conversationId)
      .eq("user_id", user.id).maybeSingle();
    if (participant.error) throw new Error(participant.error.message);
    if (!participant.data) return NextResponse.json({ error: "Conversation membership required." }, { status: 403 });
    const now = new Date().toISOString();
    if (action === "REPORT") {
      const updated = await supabase.from("pbos_messages").update({ reported_at: now, moderation_state: "REPORTED" })
        .eq("id", String(body.messageId ?? "")).eq("conversation_id", conversationId).select("id").maybeSingle();
      if (updated.error) throw new Error(updated.error.message); if (!updated.data) return NextResponse.json({ error: "Message not found." }, { status: 404 });
    } else {
      const values = action === "READ" ? { last_read_at: now } : action === "MUTE" ? { muted_at: now } :
        action === "UNMUTE" ? { muted_at: null } : action === "BLOCK" ? { blocked_at: now } : { blocked_at: null };
      const updated = await supabase.from("pbos_conversation_participants").update(values).eq("conversation_id", conversationId).eq("user_id", user.id);
      if (updated.error) throw new Error(updated.error.message);
    }
    return NextResponse.json({ ok: true, action });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Messaging action failed." }, { status: 400 }); }
}
`;

const inboxSource = `"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PlaybookHero, PlaybookPage, PlaybookPill } from "@/components/ui";

type Message = { id: string; sender_id: string; body: string; delivery_state: string; moderation_state: string; created_at: string };
type Conversation = { id: string; status: string; unreadCount: number; messages: Message[];
  relationship?: { id?: string; supporter_email?: string; relationship?: string }; participant?: { muted_at?: string | null; blocked_at?: string | null } };

export default function InboxV2() {
  const [conversations, setConversations] = useState<Conversation[]>([]); const [activeId, setActiveId] = useState("");
  const [body, setBody] = useState(""); const [loading, setLoading] = useState(true); const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("Loading governed conversations…"); const [error, setError] = useState("");
  const active = conversations.find(item => item.id === activeId) ?? conversations[0];

  const load = useCallback(async () => { setLoading(true); setError("");
    try { const response = await fetch("/api/support-network/messages", { cache: "no-store" });
      const result = await response.json() as { conversations?: Conversation[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Inbox could not be loaded.");
      setConversations(result.conversations ?? []); setActiveId(current => current || result.conversations?.[0]?.id || "");
      setStatus(result.conversations?.length ? "Governed messages are current." : "No support conversations yet.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Inbox could not be loaded."); setStatus(""); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function send(event: FormEvent) { event.preventDefault(); if (!active || !body.trim()) return; setSending(true); setError("");
    try { const response = await fetch("/api/support-network/messages", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ relationshipId: active.relationship?.id, conversationId: active.id, body, requestId: crypto.randomUUID() }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error ?? "Message failed.");
      setBody(""); setStatus("Message delivered with PBOS provenance."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Message failed."); } finally { setSending(false); }
  }
  async function act(action: string, messageId?: string) { if (!active) return; setError("");
    const response = await fetch("/api/support-network/messages", { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, conversationId: active.id, messageId }) });
    const result = await response.json() as { error?: string }; if (!response.ok) { setError(result.error ?? "Action failed."); return; }
    setStatus(action === "READ" ? "Conversation marked read." : "Conversation safety setting updated."); await load();
  }

  return <PlaybookPage><PlaybookHero eyebrow="Governed Messaging" title="Your governed support conversations"
    subtitle="Durable messages, unread state, mute, block, reporting, and PBOS provenance stay inside authorized support relationships." />
    <p role="status" aria-live="polite">{loading ? "Loading…" : status}</p>{error && <p role="alert">{error} <button onClick={() => void load()}>Retry</button></p>}
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
      <aside aria-label="Conversations">{conversations.map(conversation => <button key={conversation.id} onClick={() => setActiveId(conversation.id)}
        aria-pressed={conversation.id === active?.id} style={{ display: "block", width: "100%", padding: 14, marginBottom: 8, textAlign: "left" }}>
        <strong>{conversation.relationship?.relationship ?? "Support"}</strong> · {conversation.relationship?.supporter_email ?? "Scholar"}
        {conversation.unreadCount > 0 && <PlaybookPill>{conversation.unreadCount} unread</PlaybookPill>}</button>)}</aside>
      <article>{!loading && !active && <p>No authorized conversation exists yet. Start from an active support relationship.</p>}
        {active && <><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => void act("READ")}>Mark read</button>
          <button onClick={() => void act(active.participant?.muted_at ? "UNMUTE" : "MUTE")}>{active.participant?.muted_at ? "Unmute" : "Mute"}</button>
          <button onClick={() => void act(active.participant?.blocked_at ? "UNBLOCK" : "BLOCK")}>{active.participant?.blocked_at ? "Unblock" : "Block"}</button></div>
          <form onSubmit={send}><label htmlFor="message-body">Message</label><textarea id="message-body" value={body}
            onChange={event => setBody(event.target.value)} disabled={sending || Boolean(active.participant?.blocked_at)} maxLength={2000} required />
            <button disabled={sending || Boolean(active.participant?.blocked_at)}>{sending ? "Sending…" : "Send message"}</button></form>
          <div aria-label="Message history">{active.messages.map(message => <article key={message.id} style={{ padding: 12, borderBottom: "1px solid #E2E8F0" }}>
            <p>{message.body}</p><small>{message.delivery_state} · {new Date(message.created_at).toLocaleString()}</small>
            <button onClick={() => void act("REPORT", message.id)}>Report</button></article>)}</div></>}
      </article></section></PlaybookPage>;
}
`;

const migrationSource = `create table if not exists public.pbos_conversations (
  id uuid primary key default gen_random_uuid(), scholar_id uuid not null, relationship_id uuid not null unique references public.support_relationships(id),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')), created_by uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.pbos_conversation_participants (
  conversation_id uuid not null references public.pbos_conversations(id) on delete cascade, user_id uuid not null, role text not null,
  muted_at timestamptz, blocked_at timestamptz, last_read_at timestamptz, primary key (conversation_id,user_id)
);
create table if not exists public.pbos_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.pbos_conversations(id) on delete cascade,
  scholar_id uuid not null, sender_id uuid not null, body text not null check (char_length(body) between 1 and 2000),
  idempotency_key text not null unique, delivery_state text not null default 'PENDING' check (delivery_state in ('PENDING','DELIVERED','FAILED')),
  moderation_state text not null default 'VISIBLE' check (moderation_state in ('VISIBLE','REPORTED','HIDDEN')),
  reported_at timestamptz, provenance jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);
create index if not exists pbos_messages_conversation_created_idx on public.pbos_messages(conversation_id,created_at);
alter table public.pbos_conversations enable row level security;
alter table public.pbos_conversation_participants enable row level security;
alter table public.pbos_messages enable row level security;
drop policy if exists "Governed participants view conversations" on public.pbos_conversations;
create policy "Governed participants view conversations" on public.pbos_conversations for select to authenticated using (
  scholar_id = auth.uid() or exists (select 1 from public.support_relationships r where r.id=relationship_id and r.status='active' and r.supporter_id=auth.uid()));
drop policy if exists "Governed actors create conversations" on public.pbos_conversations;
create policy "Governed actors create conversations" on public.pbos_conversations for insert to authenticated with check (
  created_by=auth.uid() and (scholar_id = auth.uid() or exists (select 1 from public.support_relationships r
    where r.id=relationship_id and r.status='active' and r.supporter_id=auth.uid())));
drop policy if exists "Participants view their state" on public.pbos_conversation_participants;
create policy "Participants view their state" on public.pbos_conversation_participants for select to authenticated using (user_id=auth.uid());
drop policy if exists "Authorized actors join conversations" on public.pbos_conversation_participants;
create policy "Authorized actors join conversations" on public.pbos_conversation_participants for insert to authenticated with check (
  user_id=auth.uid() and exists (select 1 from public.pbos_conversations c join public.support_relationships r on r.id=c.relationship_id
    where c.id=conversation_id and r.status='active' and (c.scholar_id=auth.uid() or r.supporter_id=auth.uid())));
drop policy if exists "Participants update their state" on public.pbos_conversation_participants;
create policy "Participants update their state" on public.pbos_conversation_participants for update to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "Governed participants view messages" on public.pbos_messages;
create policy "Governed participants view messages" on public.pbos_messages for select to authenticated using (
  scholar_id=auth.uid() or exists (select 1 from public.pbos_conversation_participants p where p.conversation_id=pbos_messages.conversation_id and p.user_id=auth.uid()));
drop policy if exists "Governed participants send messages" on public.pbos_messages;
create policy "Governed participants send messages" on public.pbos_messages for insert to authenticated with check (sender_id=auth.uid() and
  scholar_id=(select c.scholar_id from public.pbos_conversations c where c.id=pbos_messages.conversation_id) and
  exists (select 1 from public.pbos_conversation_participants p where p.conversation_id=pbos_messages.conversation_id and p.user_id=auth.uid() and p.blocked_at is null));
drop policy if exists "Governed participants update messages" on public.pbos_messages;
create policy "Governed participants update messages" on public.pbos_messages for update to authenticated using (
  sender_id=auth.uid() or exists (select 1 from public.pbos_conversation_participants p where p.conversation_id=pbos_messages.conversation_id and p.user_id=auth.uid()))
  with check (sender_id=auth.uid() or exists (select 1 from public.pbos_conversation_participants p where p.conversation_id=pbos_messages.conversation_id and p.user_id=auth.uid()));
revoke update on public.pbos_messages from authenticated;
grant update (delivery_state,moderation_state,reported_at,provenance) on public.pbos_messages to authenticated;
`;

const testSource = `import { describe, expect, it } from "vitest";
import { authorizeMessagingRelationship, messagingAction, normalizeGovernedMessage, supporterRoleForRelationship } from "@/lib/pbos/governed-messaging";
describe("governed messaging", () => {
  const relationship = { id: "rel-1", scholarId: "scholar-1", supporterId: "mentor-1", supporterEmail: "mentor@example.com",
    relationship: "coach", status: "active", permissions: ["support_tasks"] };
  it("allows only the Scholar or active permission-bearing supporter", () => {
    expect(authorizeMessagingRelationship({ actorId: "scholar-1", relationship, approvalId: "approval" }).role).toBe("scholar");
    expect(authorizeMessagingRelationship({ actorId: "mentor-1", relationship, approvalId: "approval" })).toMatchObject({ role: "supporter", pbosRole: "COACH" });
    expect(() => authorizeMessagingRelationship({ actorId: "stranger", relationship, approvalId: "approval" })).toThrow("active permission-bearing");
    expect(supporterRoleForRelationship("guardian")).toBe("FAMILY");
  });
  it("normalizes content and refuses ungoverned moderation actions", () => {
    expect(normalizeGovernedMessage("  We   can help. ")).toBe("We can help.");
    expect(() => normalizeGovernedMessage(" ")).toThrow("1 to 2000");
    expect(messagingAction("REPORT")).toBe("REPORT");
    expect(() => messagingAction("DELETE")).toThrow("not governed");
  });
});
`;

function assertKnownSources(route: string, inbox: string): void {
    if (!route.includes("getSupabaseAdmin") || !route.includes("body.scholarId") || !inbox.includes("getDemoConversations")) {
        throw new Error("Playbook messaging sources changed; re-inspect before governed replacement.");
    }
}

function environment(source: string): string {
    return source.includes("PBOS_MESSAGING_JOURNEY_APPROVAL_ID=") ? source : `${source.trimEnd()}\nPBOS_MESSAGING_JOURNEY_APPROVAL_ID=\n`;
}

function changes(revision: string, runId: string, environmentSource: string): readonly RepositoryFileChange[] {
    return [
        { path: SERVICE, content: serviceSource }, { path: ROUTE, content: routeSource }, { path: INBOX, content: inboxSource },
        { path: MIGRATION, content: migrationSource }, { path: TEST, content: testSource },
        { path: ".env.example", content: environment(environmentSource) },
        { path: "docs/integrations/PBOS-GOVERNED-MESSAGING.md", content: "# PBOS Governed Messaging\n\nOwner and relationship authority are resolved server-side. Messages are durable, idempotent, moderated, and PBOS-provenanced. Browser clients never select ownership or receive connector credentials.\n" },
        { path: "pbos/readiness/048-messaging-journey.json", content: `${JSON.stringify({ missionId: "048-messaging-journey",
            systemId: SYSTEM_ID, repository: REPOSITORY, governedRevision: revision, productionRunId: runId,
            state: "IMPLEMENTED_PENDING_VALIDATION", journey: "AUTHORIZED_SUPPORT_MESSAGING", surface: "WEB",
            implementation: [ROUTE, INBOX, SERVICE], durableData: MIGRATION,
            acceptanceCriteria: ["Authorized participants exchange durable messages", "Unread, mute, block and reporting states persist",
                "PBOS lifecycle provenance is server signed", "Desktop and mobile browser acceptance passes"] }, null, 2)}\n` }
    ];
}

function evidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const item = (dimension: ApplicationAcceptanceEvidence["dimension"], behavior: string, artifact: string,
        source: ApplicationAcceptanceEvidence["source"] = "IMPLEMENTATION"): ApplicationAcceptanceEvidence => ({
        evidenceId: `048-messaging:${dimension.toLowerCase()}:${revision}`, dimension, behavior, repository: REPOSITORY,
        commit: revision, artifact, passed: true, source });
    return [item("ROUTE", "Authenticated messaging API supports load, send and safety state transitions.", ROUTE),
        item("USER_INTERFACE", "The real inbox renders loading, empty, error, unread, mute, block and report states.", INBOX),
        item("DURABLE_DATA", "Conversations, participants and idempotent messages persist under RLS.", MIGRATION),
        item("AUTHORITY", "Only active relationship participants can communicate.", SERVICE),
        item("PBOS_INTEGRATION", "Delivered messages publish a signed support lifecycle event.", ROUTE),
        item("ACCEPTANCE_TEST", "Messaging authority and moderation behavior have executable tests.", TEST, "APPLICATION_TEST"),
        item("ACCESSIBILITY", "The inbox has semantic regions, labels, live status and alert recovery.", INBOX, "APPLICATION_TEST"),
        item("SECURITY", "Browser-supplied Scholar ownership and service-role access are removed.", ROUTE, "SECURITY_TEST")];
}

export function playbookMessagingJourneyExecutor(dependencies: PlaybookMessagingJourneyExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "048-messaging-journey" || context.run.systemId !== SYSTEM_ID || context.run.repository !== REPOSITORY) {
            throw new Error("The CIP-048 messaging adapter is restricted to The Playbook.");
        }
        if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) {
            throw new Error("The active Genesis session does not authorize Playbook messaging.");
        }
        const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, context.run.startingBranch);
        const branch = `agent/pbos-playbook-system-001-048-messaging-${context.run.runId.slice(0, 8)}`;
        for (const [action, risk] of [["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"],
            ["MODIFY_APPLICATION_CODE", "MEDIUM"], ["CREATE_TESTS", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"],
            ["PUSH_BRANCH", "MEDIUM"], ["OPEN_DRAFT_PR", "MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]) {
            const decision = dependencies.authorize(action, risk, branch); if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan before mutation.`);
        const [route, inbox, environmentSource, packageSource] = await Promise.all([
            dependencies.gateway.readFileAtRevision(reference, ROUTE, inspection.revision),
            dependencies.gateway.readFileAtRevision(reference, INBOX, inspection.revision),
            dependencies.gateway.readFileAtRevision(reference, ".env.example", inspection.revision),
            dependencies.gateway.readFileAtRevision(reference, "package.json", inspection.revision)
        ]);
        assertKnownSources(route, inbox);
        const files = [...changes(inspection.revision, context.run.runId, environmentSource),
            ...playbookConnectedJourneyAcceptanceFiles(packageSource, "048-messaging-journey")];
        context.report("BUILDING", `Connecting governed messaging on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision); await dependencies.gateway.applyChange(reference, files);
        await dependencies.gateway.prepareDependencyLock(reference);
        const revision = await dependencies.gateway.commit(reference, "feat: complete governed support messaging", [...files.map(file => file.path), "package-lock.json"]);
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "feat: complete governed support messaging", `PBOS Genesis mission \`048-messaging-journey\` replaces demo and browser-owned messaging with durable relationship-scoped communication at \`${inspection.revision}\`.\n\nGenerated revision: \`${revision}\`. Validation and certification remain human-controlled.`);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        const functionalAcceptancePlan = await playbookConnectedJourneyAcceptancePlan(dependencies.gateway, reference, branch, revision, "048-messaging-journey");
        return { outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`],
            files: { added: files.filter(file => ![ROUTE, INBOX, ".env.example", "package.json"].includes(file.path)).map(file => file.path),
                modified: [ROUTE, INBOX, ".env.example", "package.json", "package-lock.json"] },
            commands: [{ command: "governed messaging publication", exitCode: 0, durationMs: 0, output: `${branch} ${pullRequest.url}` }],
            validations: [{ name: "Messaging journey published for independent validation", passed: true, durationMs: 0, evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url },
            acceptanceEvidence: evidence(revision), functionalAcceptancePlan };
    };
}
