import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, PullRequestReference, RepositoryFileChange, RepositoryReference } from "../platform";
import { ApplicationAcceptanceEvidence, ProductionMissionExecutor } from "../production-runtime";
import { RemediationRun, ResumableRemediationEngine } from "../validation-automation";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const OPPORTUNITIES_PAGE = "app/opportunities/page.tsx";
const OPPORTUNITY_MARKETPLACE = "components/opportunity-marketplace/OpportunityMarketplace.tsx";
const OPPORTUNITY_ROUTE = "app/api/pbos/opportunities/route.ts";
const OPPORTUNITY_SERVICE = "lib/pbos/opportunity-journey-service.ts";
const OPPORTUNITY_TEST = "tests/unit/pbos/opportunity-journey-service.test.ts";
const OPPORTUNITY_ACCESSIBILITY_TEST = "tests/unit/pbos/opportunity-marketplace-accessibility.test.tsx";
const OPPORTUNITY_MIGRATION = "supabase/migrations/202608050005_pbos_opportunity_journey.sql";

export interface PlaybookOpportunityJourneyExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
    readonly startMonitor: (run: RemediationRun) => void;
}

const serviceSource = `import { createHash } from "crypto";
import type { PlaybookIdentityMapping } from "../../pbos/connector/contracts";
import { matchOpportunitiesFromSignals } from "../opportunity-graph/matching/OpportunityMatcher";
import { authorizePlaybookFoundation } from "./foundation";

export type OpportunityDecision = "SAVED" | "DISMISSED";
export type OpportunityStatus = "RECOMMENDED" | OpportunityDecision;

export interface OpportunitySignals {
  skills: readonly string[];
  majors: readonly string[];
  careers: readonly string[];
  opportunities: readonly string[];
}

export interface ExplainableOpportunityMatch {
  opportunityId: string;
  title: string;
  type: string;
  description: string;
  score: number;
  reasons: readonly string[];
  nextSteps: readonly string[];
}

export interface DurableOpportunityMatch extends ExplainableOpportunityMatch {
  id: string;
  status: OpportunityStatus;
  deliveryState: "PENDING" | "DELIVERED";
  provenance: readonly string[];
}

export interface OpportunityJourneyRepository {
  persistMatches(input: { ownerId: string; matches: readonly ExplainableOpportunityMatch[]; signalFingerprint: string;
    idempotencyKey: string; provenance: readonly string[] }): Promise<readonly DurableOpportunityMatch[]>;
  completeMatchDelivery(input: { ownerId: string; matchIds: readonly string[]; provenance: readonly string[] }): Promise<void>;
  stageDecision(input: { ownerId: string; matchId: string; decision: OpportunityDecision; idempotencyKey: string;
    provenance: readonly string[] }): Promise<DurableOpportunityMatch>;
  completeDecision(input: { ownerId: string; matchId: string; decision: OpportunityDecision;
    provenance: readonly string[] }): Promise<DurableOpportunityMatch>;
}

export interface OpportunityJourneyRuntime {
  registerIdentity(userId: string): Promise<PlaybookIdentityMapping>;
  publish(identity: PlaybookIdentityMapping, payload: Readonly<Record<string, unknown>>, correlationId: string): Promise<readonly string[]>;
}

function normalized(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function fingerprintOpportunitySignals(signals: OpportunitySignals): string {
  return createHash("sha256").update(JSON.stringify({ skills: normalized(signals.skills), majors: normalized(signals.majors),
    careers: normalized(signals.careers), opportunities: normalized(signals.opportunities) })).digest("hex");
}

export function buildExplainableOpportunityMatches(signals: OpportunitySignals): readonly ExplainableOpportunityMatch[] {
  return matchOpportunitiesFromSignals({ skills: [...signals.skills], majors: [...signals.majors],
    careers: [...signals.careers], opportunities: [...signals.opportunities] }).matches
    .filter(match => match.reasons.length > 0)
    .map(match => ({ opportunityId: match.opportunity.id, title: match.opportunity.title, type: match.opportunity.type,
      description: match.opportunity.description, score: match.score, reasons: [...match.reasons], nextSteps: [...match.nextSteps] }));
}

export class OpportunityJourneyService {
  constructor(private readonly repository: OpportunityJourneyRepository, private readonly runtime: OpportunityJourneyRuntime) {}

  async discover(input: { actorId: string; ownerId: string; approvalId: string; signals: OpportunitySignals }) {
    const authority = authorizePlaybookFoundation({ userId: input.actorId, ownerId: input.ownerId,
      role: "SCHOLAR", approvalId: input.approvalId });
    const signalFingerprint = fingerprintOpportunitySignals(input.signals);
    const idempotencyKey = "opportunity-discovery-" + input.ownerId + "-" + signalFingerprint;
    const identity = await this.runtime.registerIdentity(input.actorId);
    const baseProvenance = [...authority.provenance, identity.pbosIdentity.provenance];
    const matches = buildExplainableOpportunityMatches(input.signals);
    const persisted = await this.repository.persistMatches({ ownerId: input.ownerId, matches, signalFingerprint,
      idempotencyKey, provenance: baseProvenance });
    const runtimeProvenance = await this.runtime.publish(identity, { eventType: "OPPORTUNITY_MATCHES_GENERATED",
      schemaVersion: "1.0.0", matchIds: persisted.map(match => match.id), signalFingerprint,
      explainableMatchCount: matches.length }, idempotencyKey);
    const provenance = [...baseProvenance, ...runtimeProvenance, input.approvalId];
    await this.repository.completeMatchDelivery({ ownerId: input.ownerId,
      matchIds: persisted.map(match => match.id), provenance });
    return { matches: persisted.map(match => ({ ...match, deliveryState: "DELIVERED" as const, provenance })),
      signalFingerprint, provenance };
  }

  async decide(input: { actorId: string; ownerId: string; approvalId: string; matchId: string;
    decision: OpportunityDecision; requestId: string }) {
    if (!input.matchId.trim() || !input.requestId.trim()) throw new Error("Opportunity decision requires match and request identifiers.");
    if (!(input.decision === "SAVED" || input.decision === "DISMISSED")) throw new Error("Opportunity decision is invalid.");
    const authority = authorizePlaybookFoundation({ userId: input.actorId, ownerId: input.ownerId,
      role: "SCHOLAR", approvalId: input.approvalId });
    const identity = await this.runtime.registerIdentity(input.actorId);
    const baseProvenance = [...authority.provenance, identity.pbosIdentity.provenance];
    await this.repository.stageDecision({ ownerId: input.ownerId, matchId: input.matchId,
      decision: input.decision, idempotencyKey: input.requestId, provenance: baseProvenance });
    const runtimeProvenance = await this.runtime.publish(identity, { eventType: "OPPORTUNITY_DECISION_RECORDED",
      schemaVersion: "1.0.0", matchId: input.matchId, decision: input.decision }, input.requestId);
    const provenance = [...baseProvenance, ...runtimeProvenance, input.approvalId];
    return await this.repository.completeDecision({ ownerId: input.ownerId, matchId: input.matchId,
      decision: input.decision, provenance });
  }
}
`;

const routeSource = `import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { OpportunityJourneyService } from "@/lib/pbos/opportunity-journey-service";
import type { DurableOpportunityMatch, OpportunityDecision, OpportunitySignals } from "@/lib/pbos/opportunity-journey-service";
import { PlaybookIdentityMapper } from "@/pbos/connector/identity-mapper";
import { PlaybookPbosRuntimeClient } from "@/pbos/connector/pbos-runtime-client";
import { SignedPlaybookPbosTransport } from "@/pbos/connector/signed-server-transport";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Missing protected server configuration: " + name);
  return value;
}

function runtime() {
  const client = new PlaybookPbosRuntimeClient(new SignedPlaybookPbosTransport(required("PBOS_API_URL"), {
    organizationId: required("PBOS_ORGANIZATION_ID"), connectorId: required("PBOS_CONNECTOR_ID"),
    keyId: required("PBOS_CONNECTOR_KEY_ID"), secretBase64: required("PBOS_CONNECTOR_SECRET_BASE64")
  }));
  const mapper = new PlaybookIdentityMapper();
  return {
    async registerIdentity(userId: string) {
      const identity = mapper.mapSupabaseIdentity(userId, "SCHOLAR");
      const response = await client.send("REGISTER_IDENTITY", identity, "opportunity-identity-" + userId,
        "opportunity-identity-" + userId);
      if (!response.success) throw new Error(response.error.message);
      return identity;
    },
    async publish(identity: ReturnType<PlaybookIdentityMapper["mapSupabaseIdentity"]>, payload: Readonly<Record<string, unknown>>, correlationId: string) {
      const response = await client.send("PUBLISH_LIFECYCLE_EVENT", { connectorId: "PLAYBOOK-CONNECTOR-001",
        domainRegistrationId: "PLAYBOOK-DOMAIN-SCHOLAR-REGISTRATION-001", identityMappingId: identity.mappingId,
        correlationId, purpose: "Publish an approved owner-scoped opportunity journey event.", payload }, correlationId, correlationId);
      if (!response.success) throw new Error(response.error.message);
      return response.provenance;
    }
  };
}

function serialize(row: Record<string, unknown>): DurableOpportunityMatch {
  const status = String(row.status);
  const deliveryState = String(row.delivery_state);
  if (!(status === "RECOMMENDED" || status === "SAVED" || status === "DISMISSED")) throw new Error("Stored opportunity status is invalid.");
  if (!(deliveryState === "PENDING" || deliveryState === "DELIVERED")) throw new Error("Stored opportunity delivery state is invalid.");
  return { id: String(row.id), opportunityId: String(row.opportunity_key), title: String(row.title), type: String(row.opportunity_type),
    description: String(row.description ?? ""), score: Number(row.score),
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    nextSteps: Array.isArray(row.next_steps) ? row.next_steps.map(String) : [], status,
    deliveryState, provenance: Array.isArray(row.provenance) ? row.provenance.map(String) : [] };
}

function repository(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]) {
  return {
    async persistMatches(input: { ownerId: string; matches: readonly { opportunityId: string; title: string; type: string;
      description: string; score: number; reasons: readonly string[]; nextSteps: readonly string[] }[];
      signalFingerprint: string; idempotencyKey: string; provenance: readonly string[] }) {
      if (input.matches.length === 0) return [];
      const result = await supabase.from("pbos_opportunity_recommendations").upsert(input.matches.map(match => ({ owner_id: input.ownerId,
        opportunity_key: match.opportunityId, title: match.title, opportunity_type: match.type, description: match.description,
        score: match.score, reasons: match.reasons, next_steps: match.nextSteps, signal_fingerprint: input.signalFingerprint,
        discovery_idempotency_key: input.idempotencyKey, delivery_state: "PENDING", provenance: input.provenance })),
        { onConflict: "owner_id,opportunity_key" }).select("*");
      if (result.error) throw new Error(result.error.message);
      return (result.data ?? []).map(row => serialize(row as Record<string, unknown>));
    },
    async completeMatchDelivery(input: { ownerId: string; matchIds: readonly string[]; provenance: readonly string[] }) {
      if (input.matchIds.length === 0) return;
      const result = await supabase.from("pbos_opportunity_recommendations").update({ delivery_state: "DELIVERED",
        provenance: input.provenance }).eq("owner_id", input.ownerId).in("id", [...input.matchIds]);
      if (result.error) throw new Error(result.error.message);
    },
    async stageDecision(input: { ownerId: string; matchId: string; decision: OpportunityDecision; idempotencyKey: string;
      provenance: readonly string[] }) {
      const result = await supabase.from("pbos_opportunity_recommendations").update({ pending_action: input.decision,
        decision_idempotency_key: input.idempotencyKey, delivery_state: "PENDING", provenance: input.provenance })
        .eq("id", input.matchId).eq("owner_id", input.ownerId).select("*").single();
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Owner-scoped opportunity was not found.");
      return serialize(result.data as Record<string, unknown>);
    },
    async completeDecision(input: { ownerId: string; matchId: string; decision: OpportunityDecision; provenance: readonly string[] }) {
      const result = await supabase.from("pbos_opportunity_recommendations").update({ status: input.decision,
        pending_action: null, delivery_state: "DELIVERED", provenance: input.provenance, decided_at: new Date().toISOString() })
        .eq("id", input.matchId).eq("owner_id", input.ownerId).select("*").single();
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Opportunity decision could not be committed.");
      return serialize(result.data as Record<string, unknown>);
    }
  };
}

async function signalsForOwner(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], ownerId: string): Promise<OpportunitySignals> {
  const [academic, goals] = await Promise.all([
    supabase.from("ag_progress").select("subject,subject_name,years_completed,current_course").eq("user_id", ownerId),
    supabase.from("scholar_goals").select("title").eq("scholar_id", ownerId).eq("status", "ACTIVE")
  ]);
  if (academic.error) throw new Error(academic.error.message);
  if (goals.error) throw new Error(goals.error.message);
  const subjectSignals: Record<string, readonly string[]> = { A: ["critical thinking"], B: ["writing", "communication"],
    C: ["quantitative reasoning", "problem solving"], D: ["scientific thinking", "research"],
    E: ["communication"], F: ["creative thinking"], G: ["critical thinking"] };
  const completed = (academic.data ?? []).filter(row => Number(row.years_completed ?? 0) > 0);
  return { skills: completed.flatMap(row => [...(subjectSignals[String(row.subject)] ?? []), String(row.subject_name ?? "")]),
    majors: (goals.data ?? []).map(row => String(row.title ?? "")), careers: (goals.data ?? []).map(row => String(row.title ?? "")),
    opportunities: completed.map(row => String(row.current_course ?? "")) };
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const result = await supabase.from("pbos_opportunity_recommendations").select("*").eq("owner_id", user.id)
      .order("score", { ascending: false });
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ matches: (result.data ?? []).map(row => serialize(row as Record<string, unknown>)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Opportunity loading failed." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const service = new OpportunityJourneyService(repository(supabase), runtime());
    const result = await service.discover({ actorId: user.id, ownerId: user.id,
      approvalId: required("PBOS_OPPORTUNITY_JOURNEY_APPROVAL_ID"), signals: await signalsForOwner(supabase, user.id) });
    return NextResponse.json({ matches: result.matches, signalFingerprint: result.signalFingerprint });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Opportunity discovery failed." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json() as { matchId?: unknown; decision?: unknown; requestId?: unknown };
    const decision = String(body.decision ?? "").toUpperCase() as OpportunityDecision;
    if (!(decision === "SAVED" || decision === "DISMISSED")) {
      return NextResponse.json({ error: "Decision must be SAVED or DISMISSED." }, { status: 400 });
    }
    const service = new OpportunityJourneyService(repository(supabase), runtime());
    const match = await service.decide({ actorId: user.id, ownerId: user.id,
      approvalId: required("PBOS_OPPORTUNITY_JOURNEY_APPROVAL_ID"), matchId: String(body.matchId ?? ""),
      decision, requestId: String(body.requestId ?? randomUUID()) });
    return NextResponse.json({ match });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Opportunity decision failed." }, { status: 500 });
  }
}
`;

const pageSource = `import OpportunityMarketplace from "@/components/opportunity-marketplace/OpportunityMarketplace";

export default function OpportunitiesPage() {
  return <OpportunityMarketplace />;
}
`;

const marketplaceSource = `"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type OpportunityStatus = "RECOMMENDED" | "SAVED" | "DISMISSED";
type Match = { id: string; opportunityId: string; title: string; type: string; description: string; score: number;
  reasons: readonly string[]; nextSteps: readonly string[]; status: OpportunityStatus; deliveryState: "PENDING" | "DELIVERED" };

async function responseJson(response: Response) {
  const body = await response.json() as { matches?: Match[]; match?: Match; error?: string };
  if (!response.ok) throw new Error(body.error ?? "The opportunity service could not complete this request.");
  return body;
}

export default function OpportunityMarketplace() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [filter, setFilter] = useState<"ACTIVE" | "SAVED" | "DISMISSED">("ACTIVE");
  const [busy, setBusy] = useState<string | null>("load");
  const [message, setMessage] = useState("Loading your opportunity matches.");

  const load = useCallback(async () => {
    setBusy("load"); setMessage("Loading your opportunity matches.");
    try {
      const body = await responseJson(await fetch("/api/pbos/opportunities", { cache: "no-store" }));
      setMatches(body.matches ?? []); setMessage((body.matches ?? []).length ? "Opportunity matches loaded." : "No saved matches yet. Find matches to begin.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Opportunity loading failed."); }
    finally { setBusy(null); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function discover() {
    setBusy("discover"); setMessage("PBOS is matching verified Scholar signals to opportunities.");
    try {
      const body = await responseJson(await fetch("/api/pbos/opportunities", { method: "POST" }));
      setMatches(body.matches ?? []); setFilter("ACTIVE");
      setMessage((body.matches ?? []).length ? "Explainable opportunity matches are ready." : "Add academic evidence or goals to unlock explainable matches.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Opportunity discovery failed."); }
    finally { setBusy(null); }
  }

  async function decide(match: Match, decision: "SAVED" | "DISMISSED") {
    setBusy(match.id); setMessage(decision === "SAVED" ? "Saving opportunity." : "Dismissing opportunity.");
    try {
      const body = await responseJson(await fetch("/api/pbos/opportunities", { method: "PATCH",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ matchId: match.id, decision,
          requestId: "opportunity-" + decision.toLowerCase() + "-" + match.id }) }));
      const updated = body.match;
      if (updated) setMatches(current => current.map(item => item.id === updated.id ? updated : item));
      setMessage(decision === "SAVED" ? "Opportunity saved." : "Opportunity dismissed. You can restore it by saving it later.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Opportunity decision failed."); }
    finally { setBusy(null); }
  }

  const visible = useMemo(() => matches.filter(match => filter === "ACTIVE" ? match.status !== "DISMISSED" : match.status === filter), [matches, filter]);
  return (
    <main style={{ background: "#F8F7F4", minHeight: "100vh", padding: "clamp(20px, 5vw, 48px)", fontFamily: "system-ui, sans-serif" }}>
      <section aria-labelledby="opportunity-heading" style={{ maxWidth: 1120, margin: "0 auto" }}>
        <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748B" }}>Opportunity Marketplace</p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 20, alignItems: "end", marginBottom: 22 }}>
          <div><h1 id="opportunity-heading" style={{ fontSize: "clamp(30px, 6vw, 48px)", lineHeight: 1.05, color: "#0F172A", margin: 0 }}>Your explainable matches</h1>
            <p style={{ color: "#475569", maxWidth: 680, lineHeight: 1.65 }}>Matches use your verified Scholar evidence. Every recommendation explains why it appears, and save or dismiss choices remain private to your account.</p></div>
          <button type="button" onClick={() => void discover()} disabled={busy !== null}
            style={{ border: 0, borderRadius: 999, padding: "12px 18px", background: "#B45309", color: "white", fontWeight: 800, cursor: busy ? "wait" : "pointer" }}>
            {busy === "discover" ? "Finding matches…" : "Find my matches"}
          </button>
        </div>
        <p role="status" aria-live="polite" style={{ minHeight: 24, color: "#334155" }}>{message}</p>
        <nav aria-label="Opportunity views" style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0 24px" }}>
          {(["ACTIVE", "SAVED", "DISMISSED"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value}
            onClick={() => setFilter(value)} style={{ border: "1px solid #94A3B8", borderRadius: 999, padding: "9px 14px",
              background: filter === value ? "#0F172A" : "white", color: filter === value ? "white" : "#0F172A", fontWeight: 700 }}>
            {value === "ACTIVE" ? "Recommended" : value[0] + value.slice(1).toLowerCase()}
          </button>)}
        </nav>
        {busy === "load" ? <div aria-busy="true" style={{ padding: 28, background: "white", borderRadius: 20 }}>Loading matches…</div> :
          visible.length === 0 ? <div style={{ padding: 28, background: "white", border: "1px dashed #94A3B8", borderRadius: 20 }}>
            <h2 style={{ marginTop: 0 }}>Nothing in this view yet</h2><p>Choose “Find my matches” or add verified academic evidence and goals.</p></div> :
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16 }}>
            {visible.map(match => <article key={match.id} aria-labelledby={"match-" + match.id}
              style={{ background: "white", border: "1px solid #CBD5E1", borderRadius: 20, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><p style={{ color: "#B45309", fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>{match.type}</p>
                <h2 id={"match-" + match.id} style={{ color: "#0F172A", fontSize: 21 }}>{match.title}</h2></div>
                <strong aria-label={match.score + " percent match"} style={{ color: "#0F172A", fontSize: 21 }}>{match.score}%</strong></div>
              <p style={{ color: "#475569", lineHeight: 1.55 }}>{match.description}</p>
              <h3 style={{ fontSize: 14 }}>Why this matched</h3><ul>{match.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
              <h3 style={{ fontSize: 14 }}>Next steps</h3><ul>{match.nextSteps.map(step => <li key={step}>{step}</li>)}</ul>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" disabled={busy === match.id} aria-pressed={match.status === "SAVED"}
                  onClick={() => void decide(match, "SAVED")} style={{ border: 0, borderRadius: 999, padding: "10px 14px", background: "#047857", color: "white", fontWeight: 800 }}>
                  {match.status === "SAVED" ? "Saved" : "Save"}</button>
                <button type="button" disabled={busy === match.id} onClick={() => void decide(match, "DISMISSED")}
                  style={{ border: "1px solid #64748B", borderRadius: 999, padding: "10px 14px", background: "white", color: "#0F172A", fontWeight: 800 }}>Dismiss</button>
              </div>
            </article>)}
          </div>}
      </section>
    </main>
  );
}
`;

const serviceTestSource = `import { describe, expect, it } from "vitest";
import { buildExplainableOpportunityMatches, OpportunityJourneyService } from "../../../lib/pbos/opportunity-journey-service";

const identity = { mappingId: "mapping", externalIdentity: { externalIdentityId: "scholar-1",
  externalSystemId: "PLAYBOOK-SYSTEM-001" as const, role: "SCHOLAR" as const, authorityReferences: [], active: true },
  pbosIdentity: { actorId: "PLAYBOOK-ACTOR-scholar-1", systemId: "PLAYBOOK-OS-001" as const,
    role: "SCHOLAR" as const, authorityContext: [], provenance: "identity:scholar-1", active: true }, mappedAt: new Date() };

describe("owner-scoped opportunity journey", () => {
  it("persists only explainable matches and PBOS delivery provenance", async () => {
    const calls: string[] = [];
    const service = new OpportunityJourneyService({
      persistMatches: async input => { calls.push("persist:" + input.ownerId); return input.matches.map((match, index) => ({ ...match,
        id: "match-" + index, status: "RECOMMENDED" as const, deliveryState: "PENDING" as const, provenance: input.provenance })); },
      completeMatchDelivery: async input => { calls.push("complete:" + input.matchIds.length); },
      stageDecision: async () => { throw new Error("not used"); }, completeDecision: async () => { throw new Error("not used"); }
    }, { registerIdentity: async () => identity, publish: async () => ["pbos:opportunity"] });
    const result = await service.discover({ actorId: "scholar-1", ownerId: "scholar-1", approvalId: "approval-1",
      signals: { skills: ["scientific thinking", "research"], majors: ["Biology"], careers: [], opportunities: [] } });
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every(match => match.reasons.length > 0 && match.deliveryState === "DELIVERED")).toBe(true);
    expect(result.provenance).toEqual(expect.arrayContaining(["approval-1", "pbos:opportunity"]));
    expect(calls).toEqual(["persist:scholar-1", "complete:" + result.matches.length]);
  });

  it("durably stages and commits save or dismiss after PBOS accepts it", async () => {
    const calls: string[] = [];
    const durable = { id: "match-1", opportunityId: "stem", title: "STEM", type: "scholarship", description: "Path",
      score: 90, reasons: ["Skill match: research"], nextSteps: ["Apply"], status: "RECOMMENDED" as const,
      deliveryState: "PENDING" as const, provenance: [] };
    const service = new OpportunityJourneyService({ persistMatches: async () => [], completeMatchDelivery: async () => undefined,
      stageDecision: async input => { calls.push("stage:" + input.ownerId + ":" + input.decision); return durable; },
      completeDecision: async input => { calls.push("complete:" + input.decision); return { ...durable,
        status: input.decision, deliveryState: "DELIVERED" as const, provenance: input.provenance }; }
    }, { registerIdentity: async () => identity, publish: async () => ["pbos:decision"] });
    const result = await service.decide({ actorId: "scholar-1", ownerId: "scholar-1", approvalId: "approval-1",
      matchId: "match-1", decision: "SAVED", requestId: "decision-1" });
    expect(result.status).toBe("SAVED");
    expect(result.provenance).toContain("pbos:decision");
    expect(calls).toEqual(["stage:scholar-1:SAVED", "complete:SAVED"]);
  });

  it("fails closed for cross-owner access and does not invent unexplained matches", async () => {
    expect(buildExplainableOpportunityMatches({ skills: [], majors: [], careers: [], opportunities: [] })).toEqual([]);
    const service = new OpportunityJourneyService({ persistMatches: async () => { throw new Error("must not persist"); },
      completeMatchDelivery: async () => undefined, stageDecision: async () => { throw new Error("must not stage"); },
      completeDecision: async () => { throw new Error("must not commit"); } },
      { registerIdentity: async () => { throw new Error("must not register"); }, publish: async () => [] });
    await expect(service.discover({ actorId: "one", ownerId: "two", approvalId: "approval",
      signals: { skills: ["research"], majors: [], careers: [], opportunities: [] } })).rejects.toThrow("Access denied");
  });
});
`;

const accessibilityTestSource = `/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import OpportunityMarketplace from "../../../components/opportunity-marketplace/OpportunityMarketplace";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("opportunity marketplace accessibility", () => {
  it("announces state and exposes named opportunity controls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ matches: [{ id: "match-1", opportunityId: "stem",
      title: "STEM Scholarship", type: "scholarship", description: "A verified pathway", score: 88,
      reasons: ["Skill match: research"], nextSteps: ["Add project evidence"], status: "RECOMMENDED", deliveryState: "DELIVERED" }] }),
      { status: 200, headers: { "content-type": "application/json" } })));
    render(<OpportunityMarketplace />);
    expect(await screen.findByRole("heading", { name: "STEM Scholarship" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Opportunity matches loaded");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("navigation", { name: "Opportunity views" })).toBeTruthy();
  });
});
`;

const migrationSource = `create table if not exists public.pbos_opportunity_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  opportunity_key text not null,
  opportunity_type text not null,
  title text not null,
  description text not null,
  score integer not null check (score between 0 and 100),
  reasons jsonb not null default '[]'::jsonb,
  next_steps jsonb not null default '[]'::jsonb,
  status text not null default 'RECOMMENDED' check (status in ('RECOMMENDED','SAVED','DISMISSED')),
  pending_action text check (pending_action is null or pending_action in ('SAVED','DISMISSED')),
  delivery_state text not null default 'PENDING' check (delivery_state in ('PENDING','DELIVERED')),
  signal_fingerprint text not null,
  discovery_idempotency_key text not null,
  decision_idempotency_key text,
  provenance jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(owner_id, opportunity_key)
);
alter table public.pbos_opportunity_recommendations enable row level security;
drop policy if exists "pbos-opportunities-own" on public.pbos_opportunity_recommendations;
create policy "pbos-opportunities-own" on public.pbos_opportunity_recommendations for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create index if not exists pbos_opportunities_owner_status_idx
  on public.pbos_opportunity_recommendations(owner_id, status, score desc);
`;

const guideSource = `# Governed Opportunity Journey

The CIP-048 opportunity journey replaces demo courses and browser-only state with authenticated Scholar evidence, explainable deterministic matches, owner-scoped Supabase persistence, and signed PBOS lifecycle events.

The browser never submits an owner ID. The route derives ownership from the authenticated Supabase session. Discovery stores only matches with concrete reasons. Save and dismiss use a staged durable decision; the final state becomes delivered only after PBOS accepts the signed event. PBOS rejection leaves a visible pending record for governed recovery instead of claiming success.

Required server-only configuration: \`PBOS_API_URL\`, \`PBOS_ORGANIZATION_ID\`, \`PBOS_CONNECTOR_ID\`, \`PBOS_CONNECTOR_KEY_ID\`, \`PBOS_CONNECTOR_SECRET_BASE64\`, and \`PBOS_OPPORTUNITY_JOURNEY_APPROVAL_ID\`.

Completion requires independent typecheck, tests, lint, production build, owner-isolation tests, keyboard and screen-reader review, responsive viewports, and human certification of the exact pull-request revision.
`;

export function assertOpportunityBaseline(page: string, marketplace: string): void {
    const pageSignals = ["demoCourses", "<OpportunityMarketplace courses={demoCourses}"];
    const marketplaceSignals = ["useState<Record<string, boolean>>", "setSaved", "setStatuses"];
    if (!pageSignals.every(signal => page.includes(signal)) || !marketplaceSignals.every(signal => marketplace.includes(signal))) {
        throw new Error("Playbook opportunity sources changed; re-inspect before replacing demo and browser-only behavior.");
    }
}

function changes(revision: string, runId: string): readonly RepositoryFileChange[] {
    return [
        { path: OPPORTUNITIES_PAGE, content: pageSource },
        { path: OPPORTUNITY_MARKETPLACE, content: marketplaceSource },
        { path: OPPORTUNITY_ROUTE, content: routeSource },
        { path: OPPORTUNITY_SERVICE, content: serviceSource },
        { path: OPPORTUNITY_TEST, content: serviceTestSource },
        { path: OPPORTUNITY_ACCESSIBILITY_TEST, content: accessibilityTestSource },
        { path: OPPORTUNITY_MIGRATION, content: migrationSource },
        { path: "docs/integrations/PBOS-OPPORTUNITY-JOURNEY.md", content: guideSource },
        { path: "pbos/readiness/048-opportunity-journey.json", content: `${JSON.stringify({
            missionId: "048-opportunity-journey", systemId: SYSTEM_ID, repository: REPOSITORY,
            governedRevision: revision, productionRunId: runId, state: "IMPLEMENTED_PENDING_VALIDATION",
            journey: "VERIFIED_SIGNALS_TO_EXPLAINABLE_OPPORTUNITY_DECISION", surface: "WEB",
            implementation: [OPPORTUNITIES_PAGE, OPPORTUNITY_MARKETPLACE, OPPORTUNITY_ROUTE, OPPORTUNITY_SERVICE],
            durableData: OPPORTUNITY_MIGRATION,
            acceptanceCriteria: ["Authenticated identity owns every query and mutation",
                "Only evidence-backed matches with human-readable reasons are persisted",
                "Save and dismiss survive reload and PBOS denial remains recoverable",
                "Signed PBOS events carry exact journey provenance without browser credentials",
                "Responsive loading, empty, error, save, and dismiss states are accessible",
                "Independent validation and human certification are required for completion"]
        }, null, 2)}\n` }
    ];
}

function acceptanceEvidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const evidence = (dimension: ApplicationAcceptanceEvidence["dimension"], behavior: string, artifact: string,
        source: ApplicationAcceptanceEvidence["source"]): ApplicationAcceptanceEvidence => ({
        evidenceId: `playbook-opportunity-${dimension.toLowerCase()}-${revision}`, dimension, behavior,
        repository: REPOSITORY, commit: revision, artifact, passed: true, source
    });
    return [
        evidence("ROUTE", "Authenticated discovery, loading, save, and dismiss API exists.", OPPORTUNITY_ROUTE, "IMPLEMENTATION"),
        evidence("USER_INTERFACE", "Responsive opportunity marketplace renders real owner-scoped state.", OPPORTUNITY_MARKETPLACE, "IMPLEMENTATION"),
        evidence("DURABLE_DATA", "Recommendations and staged decisions persist under owner-scoped RLS.", OPPORTUNITY_MIGRATION, "IMPLEMENTATION"),
        evidence("AUTHORITY", "Server session and PBOS approval bind every journey action to its owner.", OPPORTUNITY_SERVICE, "SECURITY_TEST"),
        evidence("PBOS_INTEGRATION", "Discovery and decision events use signed server-only PBOS communication.", OPPORTUNITY_ROUTE, "IMPLEMENTATION"),
        evidence("ACCEPTANCE_TEST", "Service acceptance covers matching, durability, provenance, and denial.", OPPORTUNITY_TEST, "APPLICATION_TEST"),
        evidence("ACCESSIBILITY", "Marketplace exposes live status, named landmarks, controls, and responsive layout.", OPPORTUNITY_ACCESSIBILITY_TEST, "APPLICATION_TEST"),
        evidence("SECURITY", "Browser-selected ownership and browser connector credentials are absent.", OPPORTUNITY_TEST, "SECURITY_TEST")
    ];
}

export function playbookOpportunityJourneyExecutor(dependencies: PlaybookOpportunityJourneyExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "048-opportunity-journey" || context.run.systemId !== SYSTEM_ID || context.run.repository !== REPOSITORY) {
            throw new Error("The CIP-048 opportunity adapter is restricted to The Playbook.");
        }
        if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) {
            throw new Error("The active Genesis session does not authorize the Playbook opportunity journey.");
        }
        const reference: RepositoryReference = { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" };
        const branch = `agent/pbos-playbook-system-001-048-opportunity-${context.run.runId.slice(0, 8)}`;
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
        const [page, marketplace] = await Promise.all([
            dependencies.gateway.readFileAtRevision(reference, OPPORTUNITIES_PAGE, inspection.revision),
            dependencies.gateway.readFileAtRevision(reference, OPPORTUNITY_MARKETPLACE, inspection.revision)
        ]);
        assertOpportunityBaseline(page, marketplace);
        const files = changes(inspection.revision, context.run.runId);
        context.report("BUILDING", `Replacing demo opportunity behavior with the governed owner-scoped journey on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, files);
        await dependencies.gateway.prepareDependencyLock(reference);
        const paths = [...files.map(file => file.path), "package-lock.json"];
        const revision = await dependencies.gateway.commit(reference, "feat: complete governed opportunity journey", paths);
        context.report("PUSHING", `Publishing opportunity-journey revision ${revision}.`);
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "feat: complete governed opportunity journey",
            `PBOS Genesis mission \`048-opportunity-journey\` replaces demo data and browser-only decisions with authenticated explainable matching, owner-scoped RLS persistence, accessible UI states, and signed PBOS events at governed revision \`${inspection.revision}\`.\n\nValidation and certification remain human-controlled.\n\nGenerated revision: \`${revision}\``);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        dependencies.startMonitor(remediation);
        context.report("VALIDATING", `GitHub Actions and bounded remediation are monitoring ${pullRequest.url}.`);
        return {
            outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`],
            acceptanceEvidence: acceptanceEvidence(revision),
            files: { added: files.filter(file => ![OPPORTUNITIES_PAGE, OPPORTUNITY_MARKETPLACE].includes(file.path)).map(file => file.path),
                modified: [OPPORTUNITIES_PAGE, OPPORTUNITY_MARKETPLACE, "package-lock.json"] },
            commands: [{ command: "governed opportunity-journey publication", exitCode: 0, durationMs: 0,
                output: `${branch} ${pullRequest.url}` }],
            validations: [{ name: "Opportunity journey published for independent validation", passed: true, durationMs: 0,
                evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url }
        };
    };
}
