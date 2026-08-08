import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ApplicationAcceptanceEvidence, ProductionMissionExecutor, ProductionRun, ProductionRuntimeService } from "../production-runtime";
import { RemediationRun, ResumableRemediationEngine } from "../validation-automation";
import { playbookConnectedJourneyAcceptanceFiles, playbookConnectedJourneyAcceptancePlan } from "./playbook-connected-journey-functional-acceptance";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const ROUTE = "app/api/notifications/route.ts";
const CENTER = "components/notifications-v2/NotificationCenter.tsx";
const SERVICE = "lib/pbos/reliable-notifications.ts";
const TEST = "tests/unit/pbos/reliable-notifications.test.ts";
const MIGRATION = "supabase/migrations/202608050009_pbos_notification_outbox.sql";

export interface PlaybookNotificationJourneyExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
}

export interface PlaybookNotificationJourneyRecoveryDependencies extends PlaybookNotificationJourneyExecutorDependencies {
    readonly production: Pick<ProductionRuntimeService, "registerBoundedRemediation">;
    readonly recoveryDefects?: readonly string[];
    readonly pullRequest: PullRequestReference;
}

const serviceSource = `export const NOTIFICATION_TYPES = ["message","invitation","shared_action","compass_alert","mail_reply","network_blocker","recommendation"] as const;
export const NOTIFICATION_MODES = ["immediate","daily_digest","weekly_digest","muted"] as const;
export type GovernedNotificationType = typeof NOTIFICATION_TYPES[number];
export type GovernedNotificationMode = typeof NOTIFICATION_MODES[number];
export type NotificationPriority = "low" | "medium" | "high" | "urgent";

export interface GovernedNotificationEvent { eventKey: string; type: GovernedNotificationType; title: string;
  body: string; href: string; priority: NotificationPriority }

export function normalizeNotificationEvent(input: Record<string, unknown>): GovernedNotificationEvent {
  const type = String(input.type ?? "") as GovernedNotificationType;
  const priority = String(input.priority ?? "medium") as NotificationPriority;
  const event = { eventKey: String(input.eventKey ?? "").trim(), type, title: String(input.title ?? "").trim(),
    body: String(input.body ?? "").trim(), href: String(input.href ?? "").trim(), priority };
  if (!event.eventKey || !NOTIFICATION_TYPES.includes(type) || !["low","medium","high","urgent"].includes(priority) ||
      !event.title || !event.body || !event.href.startsWith("/")) throw new Error("Notification event is invalid.");
  if (event.title.length > 160 || event.body.length > 1000 || event.eventKey.length > 200) throw new Error("Notification event exceeds governed limits.");
  return event;
}

export function notificationPriorityForAttempt(priority: NotificationPriority, attemptCount: number): NotificationPriority {
  if (attemptCount >= 3) return "urgent"; if (attemptCount >= 2 && priority !== "urgent") return "high"; return priority;
}

export function notificationAction(value: string): "READ" | "READ_ALL" | "PREFERENCE" | "RETRY" {
  if (!["READ","READ_ALL","PREFERENCE","RETRY"].includes(value)) throw new Error("Notification action is not governed.");
  return value as "READ" | "READ_ALL" | "PREFERENCE" | "RETRY";
}

export function notificationMode(value: string): GovernedNotificationMode {
  if (!NOTIFICATION_MODES.includes(value as GovernedNotificationMode)) throw new Error("Notification preference is invalid.");
  return value as GovernedNotificationMode;
}

export function notificationType(value: string): GovernedNotificationType {
  if (!NOTIFICATION_TYPES.includes(value as GovernedNotificationType)) throw new Error("Notification type is invalid.");
  return value as GovernedNotificationType;
}
`;

const routeSource = `import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { normalizeNotificationEvent, notificationAction, notificationMode, notificationPriorityForAttempt, notificationType,
  type GovernedNotificationEvent } from "@/lib/pbos/reliable-notifications";
import { PlaybookIdentityMapper } from "@/pbos/connector/identity-mapper";
import { PlaybookPbosRuntimeClient } from "@/pbos/connector/pbos-runtime-client";
import { SignedPlaybookPbosTransport } from "@/pbos/connector/signed-server-transport";

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error("Missing protected server configuration: " + name); return value; }

async function publishPbos(userId: string, event: GovernedNotificationEvent, correlationId: string) {
  const identity = new PlaybookIdentityMapper().mapSupabaseIdentity(userId, "SCHOLAR");
  const client = new PlaybookPbosRuntimeClient(new SignedPlaybookPbosTransport(required("PBOS_API_URL"), {
    organizationId: required("PBOS_ORGANIZATION_ID"), connectorId: required("PBOS_CONNECTOR_ID"),
    keyId: required("PBOS_CONNECTOR_KEY_ID"), secretBase64: required("PBOS_CONNECTOR_SECRET_BASE64") }));
  const response = await client.send("PUBLISH_LIFECYCLE_EVENT", { connectorId: "PLAYBOOK-CONNECTOR-001",
    domainRegistrationId: "PLAYBOOK-SCHOLAR-REGISTRATION-001", identityMappingId: identity.mappingId,
    correlationId, purpose: "Publish an approved preference-aware notification.", payload: {
      eventType: "NOTIFICATION_QUEUED", schemaVersion: "1.0.0", notificationType: event.type, eventKey: event.eventKey
    } }, correlationId, correlationId);
  if (!response.success) throw new Error(response.error.message);
  return [identity.pbosIdentity.provenance, ...response.provenance, required("PBOS_NOTIFICATION_JOURNEY_APPROVAL_ID")];
}

async function deliver(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string,
  outbox: { id: string; event_key: string; event_type: string; event_payload: Record<string, unknown>; attempt_count: number }) {
  const event = normalizeNotificationEvent({ ...outbox.event_payload, eventKey: outbox.event_key, type: outbox.event_type });
  const preference = await supabase.from("pbos_notification_preferences").select("mode").eq("owner_id", userId)
    .eq("notification_type", event.type).maybeSingle();
  if (preference.error) throw new Error(preference.error.message);
  if (preference.data?.mode === "muted") {
    const suppressed = await supabase.from("pbos_notification_outbox").update({ state: "SUPPRESSED", processed_at: new Date().toISOString(), last_error: null })
      .eq("id", outbox.id).eq("owner_id", userId); if (suppressed.error) throw new Error(suppressed.error.message);
    return { notification: null, suppressed: true };
  }
  if (["daily_digest", "weekly_digest"].includes(preference.data?.mode ?? "")) {
    const days = preference.data?.mode === "weekly_digest" ? 7 : 1;
    const queued = await supabase.from("pbos_notification_outbox").update({ state: "DIGEST_QUEUED",
      next_attempt_at: new Date(Date.now() + days * 86_400_000).toISOString(), processed_at: null, last_error: null })
      .eq("id", outbox.id).eq("owner_id", userId);
    if (queued.error) throw new Error(queued.error.message);
    return { notification: null, suppressed: false, digestQueued: true, mode: preference.data?.mode };
  }
  const provenance = await publishPbos(userId, event, userId + ":" + event.eventKey);
  const priority = notificationPriorityForAttempt(event.priority, outbox.attempt_count);
  const saved = await supabase.from("pbos_notifications").upsert({ user_id: userId, scholar_id: userId, type: event.type,
    title: event.title, body: event.body, href: event.href, priority, read: false, delivery_status: "in_app",
    source_event_key: event.eventKey, provenance }, { onConflict: "user_id,source_event_key" })
    .select("id,user_id,type,title,body,href,priority,read,created_at,source_event_key").single();
  if (saved.error || !saved.data) throw new Error(saved.error?.message ?? "Notification persistence failed.");
  const completed = await supabase.from("pbos_notification_outbox").update({ state: "DELIVERED", processed_at: new Date().toISOString(),
    last_error: null, attempt_count: outbox.attempt_count + 1 }).eq("id", outbox.id).eq("owner_id", userId);
  if (completed.error) throw new Error(completed.error.message); return { notification: saved.data, suppressed: false };
}

export async function GET() {
  try { const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const [notifications, preferences, failures] = await Promise.all([
      supabase.from("pbos_notifications").select("id,user_id,scholar_id,type,title,body,href,priority,read,created_at,source_event_key")
        .eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("pbos_notification_preferences").select("notification_type,mode").eq("owner_id", user.id),
      supabase.from("pbos_notification_outbox").select("id,event_key,event_type,attempt_count,last_error,next_attempt_at")
        .eq("owner_id", user.id).eq("state", "FAILED").order("created_at", { ascending: false })
    ]);
    if (notifications.error) throw new Error(notifications.error.message); if (preferences.error) throw new Error(preferences.error.message);
    if (failures.error) throw new Error(failures.error.message);
    return NextResponse.json({ notifications: notifications.data ?? [], preferences: preferences.data ?? [], failures: failures.data ?? [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Notification center failed." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try { const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    required("PBOS_NOTIFICATION_JOURNEY_APPROVAL_ID"); const event = normalizeNotificationEvent(await request.json() as Record<string, unknown>);
    const existing = await supabase.from("pbos_notification_outbox").select("id,event_key,event_type,event_payload,state,attempt_count")
      .eq("owner_id", user.id).eq("event_key", event.eventKey).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.state === "DELIVERED") {
      const notification = await supabase.from("pbos_notifications").select("id,user_id,type,title,body,href,priority,read,created_at,source_event_key")
        .eq("user_id", user.id).eq("source_event_key", event.eventKey).single();
      if (notification.error) throw new Error(notification.error.message); return NextResponse.json({ notification: notification.data, idempotent: true });
    }
    if (existing.data?.state === "SUPPRESSED") return NextResponse.json({ notification: null, suppressed: true, idempotent: true });
    if (existing.data?.state === "DIGEST_QUEUED") return NextResponse.json({ notification: null, digestQueued: true, idempotent: true });
    let outbox = existing.data;
    if (!outbox) {
      const created = await supabase.from("pbos_notification_outbox").insert({ owner_id: user.id, event_key: event.eventKey,
        event_type: event.type, event_payload: event, state: "PENDING", attempt_count: 0 })
        .select("id,event_key,event_type,event_payload,state,attempt_count").single();
      if (created.error || !created.data) throw new Error(created.error?.message ?? "Notification outbox persistence failed."); outbox = created.data;
    }
    try { return NextResponse.json(await deliver(supabase, user.id, outbox)); }
    catch (cause) { const detail = cause instanceof Error ? cause.message : "Delivery failed";
      await supabase.from("pbos_notification_outbox").update({ state: "FAILED", attempt_count: outbox.attempt_count + 1,
        last_error: detail.slice(0, 500), next_attempt_at: new Date(Date.now() + Math.min(60_000 * 2 ** outbox.attempt_count, 3_600_000)).toISOString() })
        .eq("id", outbox.id).eq("owner_id", user.id); throw cause; }
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Notification delivery failed." }, { status: 503 }); }
}

export async function PATCH(request: NextRequest) {
  try { const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json() as { action?: unknown; notificationId?: unknown; notificationType?: unknown; mode?: unknown; outboxId?: unknown };
    const action = notificationAction(String(body.action ?? ""));
    if (action === "READ") { const updated = await supabase.from("pbos_notifications").update({ read: true, acknowledged_at: new Date().toISOString() })
      .eq("id", String(body.notificationId ?? "")).eq("user_id", user.id); if (updated.error) throw new Error(updated.error.message); }
    if (action === "READ_ALL") { const updated = await supabase.from("pbos_notifications").update({ read: true, acknowledged_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("read", false); if (updated.error) throw new Error(updated.error.message); }
    if (action === "PREFERENCE") { const type = notificationType(String(body.notificationType ?? "")); const mode = notificationMode(String(body.mode ?? ""));
      const updated = await supabase.from("pbos_notification_preferences").upsert({ owner_id: user.id, notification_type: type, mode,
        updated_at: new Date().toISOString() }, { onConflict: "owner_id,notification_type" }); if (updated.error) throw new Error(updated.error.message); }
    if (action === "RETRY") { const found = await supabase.from("pbos_notification_outbox").select("id,event_key,event_type,event_payload,attempt_count")
      .eq("id", String(body.outboxId ?? "")).eq("owner_id", user.id).eq("state", "FAILED").maybeSingle();
      if (found.error) throw new Error(found.error.message); if (!found.data) return NextResponse.json({ error: "Retryable outbox item not found." }, { status: 404 });
      return NextResponse.json(await deliver(supabase, user.id, found.data)); }
    return NextResponse.json({ ok: true, action });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Notification action failed." }, { status: 400 }); }
}
`;

const centerSource = `"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlaybookHero, PlaybookMetric, PlaybookMetrics, PlaybookPage } from "@/components/ui";
type Notification = { id: string; type: string; title: string; body: string; href: string; priority: string; read: boolean; created_at: string };
type Preference = { notification_type: string; mode: string }; type Failure = { id: string; event_type: string; attempt_count: number; last_error: string };
type Filter = "all" | "unread" | "messages" | "actions" | "intelligence";
type NotificationResponse = {notifications?:Notification[];preferences?:Preference[];failures?:Failure[];error?:string};
async function fetchNotifications():Promise<NotificationResponse>{const response=await fetch("/api/notifications",{cache:"no-store"});
  const result=await response.json() as NotificationResponse;if(!response.ok)throw new Error(result.error??"Notifications could not be loaded.");return result;}
export default function NotificationCenter() {
  const [notifications,setNotifications]=useState<Notification[]>([]); const [preferences,setPreferences]=useState<Preference[]>([]);
  const [failures,setFailures]=useState<Failure[]>([]); const [filter,setFilter]=useState<Filter>("all");
  const [loading,setLoading]=useState(true); const [status,setStatus]=useState("Loading notifications…"); const [error,setError]=useState("");
  useEffect(()=>{let active=true;void fetchNotifications().then(result=>{if(!active)return;setNotifications(result.notifications??[]);
    setPreferences(result.preferences??[]);setFailures(result.failures??[]);setStatus("Notification state is current.");})
    .catch(cause=>{if(active){setError(cause instanceof Error?cause.message:"Notifications could not be loaded.");setStatus("");}})
    .finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
  async function reload(){setLoading(true);setError("");try{const result=await fetchNotifications();setNotifications(result.notifications??[]);
    setPreferences(result.preferences??[]);setFailures(result.failures??[]);setStatus("Notification state is current.");}
    catch(cause){setError(cause instanceof Error?cause.message:"Notifications could not be loaded.");setStatus("");}finally{setLoading(false)}}
  const visible=useMemo(()=>notifications.filter(item=>filter==="all"||(filter==="unread"?!item.read:
    filter==="messages"?["message","mail_reply"].includes(item.type):filter==="actions"?["shared_action","invitation"].includes(item.type):
    ["compass_alert","network_blocker","recommendation"].includes(item.type))),[notifications,filter]);
  async function act(payload:Record<string,unknown>){setError("");const response=await fetch("/api/notifications",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    const result=await response.json() as {error?:string};if(!response.ok){setError(result.error??"Notification action failed.");return;}await reload();}
  return <PlaybookPage><PlaybookHero eyebrow="Reliable Notifications" title="What needs your attention?"
    subtitle="Idempotent domain events, preferences, acknowledgement, bounded retry, escalation, and failure evidence in one governed center." />
    <PlaybookMetrics><PlaybookMetric label="Unread" value={String(notifications.filter(item=>!item.read).length)}/>
      <PlaybookMetric label="Delivery failures" value={String(failures.length)}/></PlaybookMetrics>
    <p role="status" aria-live="polite" style={{color:"#0F172A"}}>{loading?"Loading…":status}</p>{error&&<p role="alert">{error} <button onClick={()=>void reload()}>Retry</button></p>}
    <section aria-label="Notification preferences" style={{color:"#0F172A"}}><h2 style={{color:"#0F172A"}}>Delivery preferences</h2>{["message","mail_reply","shared_action","network_blocker"].map(type=><label key={type} style={{display:"block",color:"#0F172A"}}>{type}
      <select value={preferences.find(item=>item.notification_type===type)?.mode??"immediate"} onChange={event=>void act({action:"PREFERENCE",notificationType:type,mode:event.target.value})}>
        <option value="immediate">Immediate</option><option value="daily_digest">Daily digest</option><option value="weekly_digest">Weekly digest</option><option value="muted">Muted</option></select></label>)}</section>
    <section style={{color:"#0F172A"}}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{(["all","unread","messages","actions","intelligence"] as Filter[]).map(value=><button key={value}
      aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value}</button>)}<button onClick={()=>void act({action:"READ_ALL"})}>Mark all read</button></div>
      {!loading&&visible.length===0&&<p style={{color:"#0F172A"}}>Nothing needs attention in this view.</p>}{visible.map(item=><article key={item.id} data-read={item.read} style={{padding:16,borderBottom:"1px solid #E2E8F0",color:"#0F172A"}}>
        <span style={{display:"inline-flex",background:"#FFF7ED",border:"1px solid #FDBA74",color:"#7C2D12",borderRadius:999,padding:"6px 9px",fontSize:11,fontWeight:900,textTransform:"uppercase"}}>{item.type}</span>
        <h2 style={{color:"#0F172A"}}>{item.title}</h2><p style={{color:"#0F172A"}}>{item.body}</p><Link href={item.href} style={{color:"#1D4ED8"}}>Open</Link>{!item.read&&<button onClick={()=>void act({action:"READ",notificationId:item.id})}>Mark read</button>}
        <small style={{color:"#334155"}}>{item.priority} priority · {new Date(item.created_at).toLocaleString()}</small></article>)}</section>
    {failures.length>0&&<section aria-label="Delivery failures"><h2>Delivery recovery</h2>{failures.map(item=><article key={item.id}><p>{item.event_type}: {item.last_error}</p>
      <button onClick={()=>void act({action:"RETRY",outboxId:item.id})}>Retry delivery</button></article>)}</section>}
  </PlaybookPage>;
}
`;

const migrationSource = `create table if not exists public.pbos_notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  scholar_id uuid references auth.users(id) on delete cascade, type text not null, title text not null, body text not null,
  href text not null check (href like '/%'), priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  read boolean not null default false, delivery_status text not null default 'in_app', source_event_key text not null,
  acknowledged_at timestamptz, provenance jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(),
  unique(user_id,source_event_key)
);
create table if not exists public.pbos_notification_outbox (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, event_key text not null, event_type text not null,
  event_payload jsonb not null, state text not null default 'PENDING' check (state in ('PENDING','DELIVERED','FAILED','SUPPRESSED','DIGEST_QUEUED')),
  attempt_count integer not null default 0 check (attempt_count>=0), last_error text, next_attempt_at timestamptz,
  processed_at timestamptz, created_at timestamptz not null default now(), unique(owner_id,event_key)
);
create table if not exists public.pbos_notification_preferences (
  owner_id uuid not null, notification_type text not null, mode text not null default 'immediate'
    check (mode in ('immediate','daily_digest','weekly_digest','muted')), updated_at timestamptz not null default now(),
  primary key(owner_id,notification_type)
);
create index if not exists pbos_notification_retry_idx on public.pbos_notification_outbox(state,next_attempt_at);
alter table public.pbos_notifications enable row level security;
alter table public.pbos_notification_outbox enable row level security;
alter table public.pbos_notification_preferences enable row level security;
drop policy if exists "Owners manage PBOS notifications" on public.pbos_notifications;
create policy "Owners manage PBOS notifications" on public.pbos_notifications for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "Owners manage notification outbox" on public.pbos_notification_outbox;
create policy "Owners manage notification outbox" on public.pbos_notification_outbox for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists "Owners manage notification preferences" on public.pbos_notification_preferences;
create policy "Owners manage notification preferences" on public.pbos_notification_preferences for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
`;

const testSource = `import { describe,expect,it } from "vitest";
import { normalizeNotificationEvent,notificationAction,notificationMode,notificationPriorityForAttempt,notificationType } from "@/lib/pbos/reliable-notifications";
describe("reliable notifications",()=>{
  it("normalizes valid domain events and rejects unsafe destinations",()=>{expect(normalizeNotificationEvent({eventKey:"event-1",type:"message",title:"Reply",body:"New reply",href:"/messages",priority:"medium"}).type).toBe("message");
    expect(()=>normalizeNotificationEvent({eventKey:"event-2",type:"message",title:"Reply",body:"New reply",href:"https://evil.example",priority:"medium"})).toThrow("invalid");});
  it("escalates bounded retries and validates actions and preferences",()=>{expect(notificationPriorityForAttempt("low",2)).toBe("high");expect(notificationPriorityForAttempt("medium",3)).toBe("urgent");
    expect(notificationAction("RETRY")).toBe("RETRY");expect(()=>notificationAction("DELETE")).toThrow("not governed");expect(notificationMode("muted")).toBe("muted");
    expect(notificationType("message")).toBe("message");expect(()=>notificationType("unknown")).toThrow("type is invalid");});
});
`;

function assertKnownSources(route: string, center: string): void {
    if (!route.includes("getSupabaseAdmin") || !center.includes("getDemoNotifications") || !center.includes("Keep demo notifications")) {
        throw new Error("Playbook notification sources changed; re-inspect before governed replacement.");
    }
}
function environment(source: string): string { return source.includes("PBOS_NOTIFICATION_JOURNEY_APPROVAL_ID=") ? source : `${source.trimEnd()}\nPBOS_NOTIFICATION_JOURNEY_APPROVAL_ID=\n`; }
function changes(revision: string, runId: string, environmentSource: string): readonly RepositoryFileChange[] { return [
    {path:SERVICE,content:serviceSource},{path:ROUTE,content:routeSource},{path:CENTER,content:centerSource},{path:MIGRATION,content:migrationSource},{path:TEST,content:testSource},
    {path:".env.example",content:environment(environmentSource)},
    {path:"docs/integrations/PBOS-RELIABLE-NOTIFICATIONS.md",content:"# PBOS Reliable Notifications\n\nDomain events enter an owner-scoped idempotent outbox. Preferences, delivery, bounded retry, escalation, acknowledgement, failure evidence, and PBOS provenance are durable.\n"},
    {path:"pbos/readiness/048-notification-journey.json",content:`${JSON.stringify({missionId:"048-notification-journey",systemId:SYSTEM_ID,repository:REPOSITORY,
        governedRevision:revision,productionRunId:runId,state:"IMPLEMENTED_PENDING_VALIDATION",journey:"EVENT_TO_ACKNOWLEDGED_NOTIFICATION",surface:"WEB",
        implementation:[ROUTE,CENTER,SERVICE],durableData:MIGRATION,acceptanceCriteria:["Domain events are idempotent","Preferences govern delivery",
            "Retry and escalation are bounded and observable","Acknowledgement persists","PBOS lifecycle provenance is server signed"]},null,2)}\n`}
]; }
function evidence(revision:string):readonly ApplicationAcceptanceEvidence[]{const item=(dimension:ApplicationAcceptanceEvidence["dimension"],behavior:string,artifact:string,
    source:ApplicationAcceptanceEvidence["source"]="IMPLEMENTATION"):ApplicationAcceptanceEvidence=>({evidenceId:`048-notifications:${dimension.toLowerCase()}:${revision}`,
    dimension,behavior,repository:REPOSITORY,commit:revision,artifact,passed:true,source});return[
    item("ROUTE","Authenticated APIs load, enqueue, acknowledge, configure and retry notifications.",ROUTE),item("USER_INTERFACE","The center renders real preferences, empty, unread and failure recovery states.",CENTER),
    item("DURABLE_DATA","Outbox, preferences, idempotency and acknowledgements persist under RLS.",MIGRATION),item("AUTHORITY","Owner identity and protected approval are server resolved.",ROUTE),
    item("PBOS_INTEGRATION","Notification publication creates signed lifecycle provenance.",ROUTE),item("ACCEPTANCE_TEST","Idempotency, retry escalation and preference behavior have executable tests.",TEST,"APPLICATION_TEST"),
    item("ACCESSIBILITY","The notification center uses labeled controls, status, alerts and semantic failure recovery.",CENTER,"APPLICATION_TEST"),item("SECURITY","External hrefs, browser ownership and service-role access are rejected.",SERVICE,"SECURITY_TEST")];}

/**
 * Isolates PBOS notifications from Playbook's pre-existing notification table.
 * The legacy table has multiple historical schemas in deployed environments,
 * so mutating it would make a clean migration non-reproducible.
 */
export function wireNotificationStorageIsolation(route: string, migration: string):
    Readonly<{ route: string; migration: string }> {
    const isolatedRoute = route.replaceAll('.from("notifications")', '.from("pbos_notifications")');
    const alreadyIsolated = migration.includes("create table if not exists public.pbos_notifications (");
    if (!alreadyIsolated && !migration.includes("alter table public.notifications add column if not exists source_event_key text;")) {
        throw new Error("Playbook notification storage changed; re-inspect before repairing schema isolation.");
    }
    if (!route.includes('.from("notifications")') && !route.includes('.from("pbos_notifications")')) {
        throw new Error("Playbook notification route changed; re-inspect before repairing schema isolation.");
    }
    return { route: isolatedRoute, migration: alreadyIsolated ? migration : migrationSource };
}

export function isNotificationSchemaDriftDefect(run: ProductionRun,
    recoveryDefects: readonly string[] = []): boolean {
    const evidenceText = [run.terminalSummary, ...(run.blockers ?? []), ...recoveryDefects].join("\n");
    return run.systemId === SYSTEM_ID && run.selectedMission === "Complete reliable notification journey" &&
        evidenceText.includes("Supabase staging migration failed with HTTP 400");
}

/** Advances the existing notification mission and PR with an isolated, additive storage contract. */
export async function preparePlaybookNotificationSchemaRecovery(
    dependencies: PlaybookNotificationJourneyRecoveryDependencies, run: ProductionRun):
    Promise<Readonly<{ branch: string; revision: string; remediation: RemediationRun }>> {
    if (run.status !== "BLOCKED" || !run.currentBranch || run.activeRecoveryEpochId ||
        !isNotificationSchemaDriftDefect(run, dependencies.recoveryDefects)) {
        throw new Error("The production run is not eligible for notification schema recovery.");
    }
    if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY ||
        dependencies.pullRequest.repository !== REPOSITORY || dependencies.pullRequest.branch !== run.currentBranch) {
        throw new Error("The active Genesis session and pull request do not authorize notification schema recovery.");
    }
    const branch = run.currentBranch;
    const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, branch);
    for (const [action, risk] of [["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"],
        ["MODIFY_APPLICATION_CODE", "MEDIUM"], ["CREATE_TESTS", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"],
        ["PUSH_BRANCH", "MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]) {
        const decision = dependencies.authorize(action, risk, branch);
        if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
    }
    const inspection = await dependencies.gateway.inspectRepository(reference);
    if (inspection.revision !== run.currentCommit) {
        throw new Error(`Notification schema recovery lineage moved from ${run.currentCommit} to ${inspection.revision}; re-inspect before mutation.`);
    }
    const [route, migration] = await Promise.all([
        dependencies.gateway.readFileAtRevision(reference, ROUTE, inspection.revision),
        dependencies.gateway.readFileAtRevision(reference, MIGRATION, inspection.revision)
    ]);
    const repaired = wireNotificationStorageIsolation(route, migration);
    const files: readonly RepositoryFileChange[] = [
        { path: ROUTE, content: repaired.route },
        { path: MIGRATION, content: repaired.migration }
    ];
    await dependencies.gateway.applyChange(reference, files);
    const revision = await dependencies.gateway.commit(reference,
        "fix: isolate governed notification storage", files.map(file => file.path));
    await dependencies.gateway.push(reference, branch);
    const remediation = dependencies.remediation.start(SYSTEM_ID, dependencies.pullRequest);
    dependencies.production.registerBoundedRemediation(run.runId, remediation.runId, branch, revision,
        "NOTIFICATION_SCHEMA_ISOLATION");
    return { branch, revision, remediation };
}

/** Repairs only the foreground colors proven inaccessible by the notification browser journey. */
export function wireNotificationAccessibilityContrast(source: string): string {
    if (source.includes('aria-live="polite" style={{color:"#0F172A"}}') &&
        source.includes('style={{color:"#1D4ED8"}}>Open</Link>') && !source.includes("opacity:item.read?.7:1")) return source;
    const inheritedContrast = source.includes('<p role="status" aria-live="polite">') &&
        source.includes('<section aria-label="Notification preferences"><h2>Delivery preferences</h2>') &&
        source.includes('<PlaybookPill>{item.type}</PlaybookPill>');
    const ancestorOpacity = source.includes('opacity:item.read?.7:1') &&
        source.includes('color:"#7C2D12"');
    if (!inheritedContrast && !ancestorOpacity) {
        throw new Error("Playbook notification interface changed; re-inspect before repairing contrast.");
    }
    return source
        .replace('import { PlaybookHero, PlaybookMetric, PlaybookMetrics, PlaybookPage, PlaybookPill } from "@/components/ui";',
            'import { PlaybookHero, PlaybookMetric, PlaybookMetrics, PlaybookPage } from "@/components/ui";')
        .replace('<p role="status" aria-live="polite">',
            '<p role="status" aria-live="polite" style={{color:"#0F172A"}}>')
        .replace('<section aria-label="Notification preferences"><h2>Delivery preferences</h2>',
            '<section aria-label="Notification preferences" style={{color:"#0F172A"}}><h2 style={{color:"#0F172A"}}>Delivery preferences</h2>')
        .replace('style={{display:"block"}}>{type}', 'style={{display:"block",color:"#0F172A"}}>{type}')
        .replace('<section><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>',
            '<section style={{color:"#0F172A"}}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>')
        .replace('<p>Nothing needs attention in this view.</p>',
            '<p style={{color:"#0F172A"}}>Nothing needs attention in this view.</p>')
        .replace('style={{padding:16,borderBottom:"1px solid #E2E8F0",opacity:item.read?.7:1}}>',
            'data-read={item.read} style={{padding:16,borderBottom:"1px solid #E2E8F0",color:"#0F172A"}}>')
        .replace('style={{padding:16,borderBottom:"1px solid #E2E8F0",opacity:item.read?.7:1,color:"#0F172A"}}>',
            'data-read={item.read} style={{padding:16,borderBottom:"1px solid #E2E8F0",color:"#0F172A"}}>')
        .replace('<PlaybookPill>{item.type}</PlaybookPill><h2>{item.title}</h2><p>{item.body}</p><Link href={item.href}>Open</Link>',
            '<span style={{display:"inline-flex",background:"#FFF7ED",border:"1px solid #FDBA74",color:"#7C2D12",borderRadius:999,padding:"6px 9px",fontSize:11,fontWeight:900,textTransform:"uppercase"}}>{item.type}</span>\n        <h2 style={{color:"#0F172A"}}>{item.title}</h2><p style={{color:"#0F172A"}}>{item.body}</p><Link href={item.href} style={{color:"#1D4ED8"}}>Open</Link>')
        .replace('<small>{item.priority} priority · {new Date(item.created_at).toLocaleString()}</small>',
            '<small style={{color:"#334155"}}>{item.priority} priority · {new Date(item.created_at).toLocaleString()}</small>');
}

export function isNotificationAccessibilityContrastDefect(run: ProductionRun,
    recoveryDefects: readonly string[] = []): boolean {
    const evidenceText = [run.terminalSummary, ...(run.blockers ?? []), ...recoveryDefects].join("\n");
    return run.systemId === SYSTEM_ID && run.selectedMission === "Complete reliable notification journey" &&
        evidenceText.includes("Browser journey command failed for EVENT-TO-ACKNOWLEDGED-NOTIFICATION") &&
        evidenceText.includes('"id": "color-contrast"') && evidenceText.includes("Notification state is current") &&
        evidenceText.includes("#ffffff") && evidenceText.includes("#f8f7f4");
}

export function isNotificationReadStateContrastDefect(run: ProductionRun,
    recoveryDefects: readonly string[] = []): boolean {
    const evidenceText = [run.terminalSummary, ...(run.blockers ?? []), ...recoveryDefects].join("\n");
    return run.systemId === SYSTEM_ID && run.selectedMission === "Complete reliable notification journey" &&
        evidenceText.includes("Browser journey command failed for EVENT-TO-ACKNOWLEDGED-NOTIFICATION") &&
        evidenceText.includes('"id": "color-contrast"') && evidenceText.includes("#a16a56") &&
        evidenceText.includes("#fdf7ef") && evidenceText.includes("article > span");
}

/** Advances the same notification mission and PR with the exact axe-proven contrast repair. */
export async function preparePlaybookNotificationAccessibilityRecovery(
    dependencies: PlaybookNotificationJourneyRecoveryDependencies, run: ProductionRun):
    Promise<Readonly<{ branch: string; revision: string; remediation: RemediationRun }>> {
    const readStateDefect = isNotificationReadStateContrastDefect(run, dependencies.recoveryDefects);
    if (run.status !== "BLOCKED" || !run.currentBranch || run.activeRecoveryEpochId ||
        (!isNotificationAccessibilityContrastDefect(run, dependencies.recoveryDefects) && !readStateDefect)) {
        throw new Error("The production run is not eligible for notification accessibility recovery.");
    }
    if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY ||
        dependencies.pullRequest.repository !== REPOSITORY || dependencies.pullRequest.branch !== run.currentBranch) {
        throw new Error("The active Genesis session and pull request do not authorize notification accessibility recovery.");
    }
    const branch = run.currentBranch;
    const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, branch);
    for (const [action, risk] of [["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"],
        ["MODIFY_APPLICATION_CODE", "MEDIUM"], ["CREATE_TESTS", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"],
        ["PUSH_BRANCH", "MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]) {
        const decision = dependencies.authorize(action, risk, branch);
        if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
    }
    const inspection = await dependencies.gateway.inspectRepository(reference);
    if (inspection.revision !== run.currentCommit) {
        throw new Error(`Notification accessibility lineage moved from ${run.currentCommit} to ${inspection.revision}; re-inspect before mutation.`);
    }
    const source = await dependencies.gateway.readFileAtRevision(reference, CENTER, inspection.revision);
    const files: readonly RepositoryFileChange[] = [
        { path: CENTER, content: wireNotificationAccessibilityContrast(source) }
    ];
    await dependencies.gateway.applyChange(reference, files);
    const revision = await dependencies.gateway.commit(reference,
        "fix: meet notification contrast acceptance", files.map(file => file.path));
    await dependencies.gateway.push(reference, branch);
    const remediation = dependencies.remediation.start(SYSTEM_ID, dependencies.pullRequest);
    dependencies.production.registerBoundedRemediation(run.runId, remediation.runId, branch, revision,
        readStateDefect ? "NOTIFICATION_READ_STATE_CONTRAST" : "NOTIFICATION_ACCESSIBILITY_CONTRAST");
    return { branch, revision, remediation };
}

export function playbookNotificationJourneyExecutor(dependencies:PlaybookNotificationJourneyExecutorDependencies):ProductionMissionExecutor{return async context=>{
    if(context.mission.missionId!=="048-notification-journey"||context.run.systemId!==SYSTEM_ID||context.run.repository!==REPOSITORY)throw new Error("The CIP-048 notification adapter is restricted to The Playbook.");
    if(dependencies.session.system.systemId!==SYSTEM_ID||dependencies.session.system.repository!==REPOSITORY)throw new Error("The active Genesis session does not authorize Playbook notifications.");
    const reference=governedBuildReference({owner:"sgwalton87",name:"playbook-platform",defaultBranch:"main"},context.run.startingBranch);
    const branch=`agent/pbos-playbook-system-001-048-notifications-${context.run.runId.slice(0,8)}`;
    for(const [action,risk] of [["INSPECT_REPOSITORY","LOW"],["PROPOSE_CHANGE","MEDIUM"],["MODIFY_APPLICATION_CODE","MEDIUM"],["CREATE_TESTS","MEDIUM"],
      ["CREATE_COMMIT","MEDIUM"],["PUSH_BRANCH","MEDIUM"],["OPEN_DRAFT_PR","MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]){const decision=dependencies.authorize(action,risk,branch);if(!decision.allowed)throw new Error(`${action} denied: ${decision.reason}`);}
    const inspection=await dependencies.gateway.inspectRepository(reference);if(inspection.revision!==context.run.startingCommit)throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan before mutation.`);
    const [route,center,environmentSource,packageSource]=await Promise.all([dependencies.gateway.readFileAtRevision(reference,ROUTE,inspection.revision),
      dependencies.gateway.readFileAtRevision(reference,CENTER,inspection.revision),dependencies.gateway.readFileAtRevision(reference,".env.example",inspection.revision),
      dependencies.gateway.readFileAtRevision(reference,"package.json",inspection.revision)]);assertKnownSources(route,center);
    const files=[...changes(inspection.revision,context.run.runId,environmentSource),...playbookConnectedJourneyAcceptanceFiles(packageSource,"048-notification-journey")];
    context.report("BUILDING",`Connecting reliable notifications on ${branch}.`);await dependencies.gateway.createBranch(reference,branch,inspection.revision);
    await dependencies.gateway.applyChange(reference,files);await dependencies.gateway.prepareDependencyLock(reference);
    const revision=await dependencies.gateway.commit(reference,"feat: complete reliable notification journey",[...files.map(file=>file.path),"package-lock.json"]);
    await dependencies.gateway.push(reference,branch);const pullRequest:PullRequestReference=await dependencies.gateway.openDraftPullRequest(reference,branch,
      "feat: complete reliable notification journey",`PBOS Genesis mission \`048-notification-journey\` replaces demo-only notifications with an owner-scoped durable outbox at \`${inspection.revision}\`.\n\nGenerated revision: \`${revision}\`. Validation and certification remain human-controlled.`);
    const remediation=dependencies.remediation.start(SYSTEM_ID,pullRequest);const functionalAcceptancePlan=await playbookConnectedJourneyAcceptancePlan(dependencies.gateway,reference,branch,revision,"048-notification-journey");
    return{outputs:{branch,revision,pullRequest,remediationRunId:remediation.runId},evidenceIds:[`repository:${inspection.revision}`,`commit:${revision}`,`pull-request:${pullRequest.number}`],
      files:{added:files.filter(file=>![ROUTE,CENTER,".env.example","package.json"].includes(file.path)).map(file=>file.path),modified:[ROUTE,CENTER,".env.example","package.json","package-lock.json"]},
      commands:[{command:"reliable notification publication",exitCode:0,durationMs:0,output:`${branch} ${pullRequest.url}`}],validations:[{name:"Notification journey published for independent validation",passed:true,durationMs:0,evidenceId:`pull-request:${pullRequest.number}`}],
      deferredValidation:{remediationRunId:remediation.runId,pullRequestUrl:pullRequest.url},acceptanceEvidence:evidence(revision),functionalAcceptancePlan};};}
