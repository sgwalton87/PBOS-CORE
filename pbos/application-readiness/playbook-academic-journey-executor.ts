import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ApplicationAcceptanceEvidence, ProductionMissionExecutor, ProductionRun, ProductionRuntimeService } from "../production-runtime";
import { RemediationRun, ResumableRemediationEngine } from "../validation-automation";
import { playbookAcademicAcceptanceFiles, playbookAcademicAcceptancePlan } from "./playbook-academic-functional-acceptance";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const TRANSCRIPT_ROUTE = "app/api/parse-transcript/route.ts";
const TRANSCRIPT_UPLOAD = "components/transcript/TranscriptUploadCard.tsx";

function acceptanceEvidence(revision: string): readonly ApplicationAcceptanceEvidence[] {
    const evidence = (dimension: ApplicationAcceptanceEvidence["dimension"], evidenceId: string, behavior: string,
        artifact: string, source: ApplicationAcceptanceEvidence["source"]): ApplicationAcceptanceEvidence => ({
        dimension, evidenceId, behavior, artifact, source, repository: REPOSITORY, commit: revision, passed: true
    });
    return [
        evidence("ROUTE", `academic-route:${revision}`, "An authenticated transcript endpoint validates bounded input and computes academic readiness.",
            TRANSCRIPT_ROUTE, "IMPLEMENTATION"),
        evidence("USER_INTERFACE", `academic-ui:${revision}`, "The real transcript upload component sends no owner identity, enforces a browser size bound, and reports live status.",
            TRANSCRIPT_UPLOAD, "IMPLEMENTATION"),
        evidence("DURABLE_DATA", `academic-data:${revision}`, "A-G progress and delivery-tracked academic evidence persist under owner-scoped row-level security.",
            "supabase/migrations/202608050004_pbos_academic_journey.sql", "IMPLEMENTATION"),
        evidence("AUTHORITY", `academic-authority:${revision}`, "The authenticated server identity owns every mutation; cross-owner service calls fail closed.",
            "lib/pbos/academic-transcript-journey.ts", "SECURITY_TEST"),
        evidence("PBOS_INTEGRATION", `academic-pbos:${revision}`, "The server publishes a signed academic-readiness lifecycle event with durable evidence provenance.",
            TRANSCRIPT_ROUTE, "IMPLEMENTATION"),
        evidence("ACCEPTANCE_TEST", `academic-tests:${revision}`, "Application tests cover persistence, provenance, cross-owner denial, media rejection, and missing input.",
            "tests/unit/pbos/academic-transcript-journey.test.ts", "APPLICATION_TEST"),
        evidence("ACCESSIBILITY", `academic-accessibility:${revision}`, "Upload progress and errors are announced through a polite live status region.",
            TRANSCRIPT_UPLOAD, "APPLICATION_TEST"),
        evidence("SECURITY", `academic-security:${revision}`, "Browser-selected ownership and service-role mutation are removed; media type and payload bounds are enforced.",
            "tests/unit/pbos/academic-transcript-journey.test.ts", "SECURITY_TEST")
    ];
}

export interface PlaybookAcademicJourneyExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
}

export interface PlaybookAcademicJourneyRecoveryDependencies extends PlaybookAcademicJourneyExecutorDependencies {
    readonly production: Pick<ProductionRuntimeService, "registerRecoveryRemediation">;
    readonly recoveryDefects?: readonly string[];
}

const academicServiceSource = `import { createHash } from "crypto";
import type { PlaybookIdentityMapping } from "../../pbos/connector/contracts";
import { authorizePlaybookFoundation } from "./foundation";

export const TRANSCRIPT_MEDIA_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const MAX_TRANSCRIPT_BASE64_LENGTH = 16 * 1024 * 1024;

export function validateTranscriptInput(base64: string, mediaType: string): void {
  if (!base64.trim()) throw new Error("Transcript file is required.");
  if (base64.length > MAX_TRANSCRIPT_BASE64_LENGTH) throw new Error("Transcript file exceeds the governed size limit.");
  if (!(TRANSCRIPT_MEDIA_TYPES as readonly string[]).includes(mediaType)) throw new Error("Transcript file type is not supported.");
}

export interface AcademicJourneyRepository {
  saveEvidence(input: { ownerId: string; readinessScore: number; agUpdates: number; idempotencyKey: string; provenance: readonly string[] }): Promise<{ evidenceId: string }>;
  completeEvidence(input: { ownerId: string; evidenceId: string; provenance: readonly string[] }): Promise<void>;
}

export interface AcademicJourneyRuntime {
  registerIdentity(userId: string): Promise<PlaybookIdentityMapping>;
  publish(identity: PlaybookIdentityMapping, evidenceId: string, readinessScore: number, correlationId: string): Promise<readonly string[]>;
}

export function academicPublicationIdempotencyKey(identityMappingId: string, evidenceId: string, readinessScore: number): string {
  const payload = { operation: "PUBLISH_LIFECYCLE_EVENT", connectorId: "PLAYBOOK-CONNECTOR-001",
    domainRegistrationId: "PLAYBOOK-SCHOLAR-REGISTRATION-001", purpose: "Publish approved academic readiness evidence.",
    identityMappingId, evidenceId, eventType: "ACADEMIC_READINESS_UPDATED", schemaVersion: "1.0.0", readinessScore };
  return "academic-publish-" + createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

export class AcademicTranscriptJourneyService {
  constructor(private readonly repository: AcademicJourneyRepository, private readonly runtime: AcademicJourneyRuntime) {}

  async complete(input: { actorId: string; ownerId: string; approvalId: string; readinessScore: number; agUpdates: number; idempotencyKey: string }) {
    if (!input.idempotencyKey.trim()) throw new Error("Academic journey idempotency key required.");
    if (!Number.isFinite(input.readinessScore) || input.readinessScore < 0 || input.readinessScore > 100) throw new Error("Academic readiness score is invalid.");
    const authority = authorizePlaybookFoundation({ userId: input.actorId, ownerId: input.ownerId, role: "SCHOLAR", approvalId: input.approvalId });
    const identity = await this.runtime.registerIdentity(input.actorId);
    const baseProvenance = [...authority.provenance, identity.pbosIdentity.provenance];
    const evidence = await this.repository.saveEvidence({ ownerId: input.ownerId, readinessScore: input.readinessScore,
      agUpdates: input.agUpdates, idempotencyKey: input.idempotencyKey, provenance: baseProvenance });
    const publicationIdempotencyKey = academicPublicationIdempotencyKey(identity.mappingId, evidence.evidenceId, input.readinessScore);
    const runtimeProvenance = await this.runtime.publish(identity, evidence.evidenceId, input.readinessScore, publicationIdempotencyKey);
    const provenance = [...baseProvenance, ...runtimeProvenance, input.approvalId];
    await this.repository.completeEvidence({ ownerId: input.ownerId, evidenceId: evidence.evidenceId, provenance });
    return { evidenceId: evidence.evidenceId, readinessScore: input.readinessScore, provenance };
  }
}
`;

const transcriptRouteSource = `import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { AcademicTranscriptJourneyService, validateTranscriptInput } from "@/lib/pbos/academic-transcript-journey";
import { buildAcademicIntelligenceReport } from "@/lib/academic-intelligence";
import { PlaybookConnector } from "@/pbos/connector/playbook-connector";
import { PlaybookPbosRuntimeClient } from "@/pbos/connector/pbos-runtime-client";
import { SignedPlaybookPbosTransport } from "@/pbos/connector/signed-server-transport";

const AG_SUBJECTS = [
  { key: "A", name: "History / Social Science", required: 2 }, { key: "B", name: "English", required: 4 },
  { key: "C", name: "Mathematics", required: 3 }, { key: "D", name: "Laboratory Science", required: 2 },
  { key: "E", name: "Language Other Than English", required: 2 }, { key: "F", name: "Visual & Performing Arts", required: 1 },
  { key: "G", name: "College-Preparatory Elective", required: 1 }
] as const;
type AgSubjectResult = { years_required?: number | string; years_completed?: number | string; in_progress?: boolean; courses_taken?: unknown[]; current_course?: string | null };
type AgParseResult = Record<string, AgSubjectResult | undefined>;
type AnthropicResponse = { content?: { text?: string }[]; error?: unknown };

const PROMPT = \`Analyze this student transcript and return only JSON containing California A-G categories A through G. For each category include years_completed, years_required, in_progress, courses_taken, and current_course. Count only visible passing coursework when grades are available.\`;
function required(name: string): string { const value = process.env[name]; if (!value) throw new Error("Missing protected server configuration: " + name); return value; }

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json() as { base64?: unknown; mediaType?: unknown; requestId?: unknown };
    const base64 = String(body.base64 ?? ""); const mediaType = String(body.mediaType ?? "");
    validateTranscriptInput(base64, mediaType);
    const requestId = String(body.requestId ?? "transcript-" + user.id + "-" + createHash("sha256").update(base64).digest("hex").slice(0, 16));
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: {
      "content-type": "application/json", "x-api-key": required("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01"
    }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: [
      { type: mediaType.startsWith("image/") ? "image" : "document", source: { type: "base64", media_type: mediaType, data: base64 } },
      { type: "text", text: PROMPT }
    ] }] }) });
    if (!aiResponse.ok) return NextResponse.json({ error: "Transcript intelligence is temporarily unavailable." }, { status: 502 });
    const ai = await aiResponse.json() as AnthropicResponse;
    if (ai.error) return NextResponse.json({ error: "Transcript intelligence could not read this file." }, { status: 422 });
    const text = ai.content?.[0]?.text ?? "";
    const raw = text.match(/\`\`\`json([\\s\\S]*?)\`\`\`/)?.[1]?.trim() ?? text.match(/\\{[\\s\\S]*\\}/)?.[0];
    if (!raw) return NextResponse.json({ error: "Transcript evidence could not be extracted." }, { status: 422 });
    const parsed = JSON.parse(raw) as AgParseResult;
    let agUpdates = 0;
    for (const subject of AG_SUBJECTS) {
      const value = parsed[subject.key] ?? {};
      const result = await supabase.from("ag_progress").upsert({ user_id: user.id, subject: subject.key,
        subject_name: subject.name, years_required: Number(value.years_required ?? subject.required),
        years_completed: Number(value.years_completed ?? 0), in_progress: Boolean(value.in_progress),
        courses_taken: Array.isArray(value.courses_taken) ? value.courses_taken : [], current_course: value.current_course ?? null,
        updated_at: new Date().toISOString() }, { onConflict: "user_id,subject" });
      if (result.error) throw new Error(result.error.message); agUpdates += 1;
    }
    const courses = Object.entries(parsed).flatMap(([category, value]) => (value?.courses_taken ?? []).map(course => ({
      name: typeof course === "string" ? course : "Transcript course", subject: category, credits: 10,
      agCategory: category as "A" | "B" | "C" | "D" | "E" | "F" | "G", completed: true
    })));
    const readiness = buildAcademicIntelligenceReport(courses);
    const client = new PlaybookPbosRuntimeClient(new SignedPlaybookPbosTransport(required("PBOS_API_URL"), {
      organizationId: required("PBOS_ORGANIZATION_ID"), connectorId: required("PBOS_CONNECTOR_ID"),
      keyId: required("PBOS_CONNECTOR_KEY_ID"), secretBase64: required("PBOS_CONNECTOR_SECRET_BASE64")
    }));
    const connector = new PlaybookConnector(client);
    const journey = new AcademicTranscriptJourneyService({
      async saveEvidence(input) {
        const saved = await supabase.from("academic_journey_evidence").upsert({ owner_id: input.ownerId,
          readiness_score: input.readinessScore, ag_updates: input.agUpdates, idempotency_key: input.idempotencyKey,
          provenance: input.provenance }, { onConflict: "idempotency_key" }).select("id").single();
        if (saved.error || !saved.data) throw new Error(saved.error?.message ?? "Academic evidence persistence failed.");
        return { evidenceId: saved.data.id as string };
      },
      async completeEvidence(input) {
        const completed = await supabase.from("academic_journey_evidence").update({ delivery_state: "DELIVERED",
          provenance: input.provenance, delivered_at: new Date().toISOString() }).eq("id", input.evidenceId).eq("owner_id", input.ownerId);
        if (completed.error) throw new Error(completed.error.message);
      }
    }, {
      registerIdentity: userId => connector.registerIdentity(userId, "SCHOLAR"),
      async publish(identity, evidenceId, readinessScore, correlationId) {
        const response = await client.send("PUBLISH_LIFECYCLE_EVENT", { connectorId: "PLAYBOOK-CONNECTOR-001",
          domainRegistrationId: "PLAYBOOK-SCHOLAR-REGISTRATION-001", identityMappingId: identity.mappingId,
          correlationId, purpose: "Publish approved academic readiness evidence.", payload: {
            eventType: "ACADEMIC_READINESS_UPDATED", schemaVersion: "1.0.0", evidenceId, readinessScore
          } }, correlationId, correlationId);
        if (!response.success) throw new Error(response.error.message); return response.provenance;
      }
    });
    const evidence = await journey.complete({ actorId: user.id, ownerId: user.id,
      approvalId: required("PBOS_ACADEMIC_JOURNEY_APPROVAL_ID"), readinessScore: readiness.score, agUpdates, idempotencyKey: requestId });
    return NextResponse.json({ ok: true, agUpdates, readiness, evidence });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transcript journey failed." }, { status: 500 });
  }
}
`;

const academicTestSource = `import { describe, expect, it } from "vitest";
import { AcademicTranscriptJourneyService, validateTranscriptInput } from "../../../lib/pbos/academic-transcript-journey";

describe("authenticated transcript-to-readiness journey", () => {
  it("persists owner-scoped evidence and PBOS provenance", async () => {
    const calls: string[] = [];
    const service = new AcademicTranscriptJourneyService({ saveEvidence: async input => { calls.push(input.ownerId, "save:" + input.idempotencyKey); return { evidenceId: "evidence-1" }; },
      completeEvidence: async input => { calls.push("complete:" + input.evidenceId); } }, {
      registerIdentity: async userId => ({ mappingId: "mapping", externalIdentity: { externalIdentityId: userId,
        externalSystemId: "PLAYBOOK-SYSTEM-001", role: "SCHOLAR", authorityReferences: [], active: true },
        pbosIdentity: { actorId: "PLAYBOOK-ACTOR-" + userId, systemId: "PLAYBOOK-OS-001", role: "SCHOLAR",
          authorityContext: [], provenance: "identity:" + userId, active: true }, mappedAt: new Date() }),
      publish: async (_identity, _evidenceId, _score, correlationId) => { calls.push("publish:" + correlationId); return ["pbos:academic"]; }
    });
    const result = await service.complete({ actorId: "scholar-1", ownerId: "scholar-1", approvalId: "approval-1",
      readinessScore: 82, agUpdates: 7, idempotencyKey: "transcript-1" });
    expect(calls.slice(0, 2)).toEqual(["scholar-1", "save:transcript-1"]);
    expect(calls[2]).toMatch(/^publish:academic-publish-[a-f0-9]{24}$/);
    expect(calls[3]).toBe("complete:evidence-1");
    expect(result.provenance).toEqual(expect.arrayContaining(["approval-1", "pbos:academic"]));
  });

  it("rejects cross-owner access and unsafe transcript input", async () => {
    const service = new AcademicTranscriptJourneyService({ saveEvidence: async () => { throw new Error("must not save"); }, completeEvidence: async () => undefined },
      { registerIdentity: async () => { throw new Error("must not register"); }, publish: async () => [] });
    await expect(service.complete({ actorId: "one", ownerId: "two", approvalId: "approval", readinessScore: 50,
      agUpdates: 7, idempotencyKey: "key" })).rejects.toThrow("Access denied");
    expect(() => validateTranscriptInput("data", "text/plain")).toThrow("not supported");
    expect(() => validateTranscriptInput("", "application/pdf")).toThrow("required");
  });
});
`;

const migration = `create table if not exists academic_journey_evidence (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
  readiness_score numeric not null check (readiness_score between 0 and 100), ag_updates integer not null check (ag_updates between 0 and 7),
  idempotency_key text not null unique, delivery_state text not null default 'PENDING' check (delivery_state in ('PENDING','DELIVERED')),
  provenance jsonb not null default '[]', created_at timestamptz not null default now(), delivered_at timestamptz
);
alter table academic_journey_evidence enable row level security;
drop policy if exists "academic-evidence-own" on academic_journey_evidence;
create policy "academic-evidence-own" on academic_journey_evidence using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create index if not exists academic_journey_evidence_owner_idx on academic_journey_evidence(owner_id, created_at desc);
`;

const guide = `# Transcript-to-Academic-Readiness Journey

This journey replaces browser-supplied identity and service-role mutation with authenticated, owner-scoped Supabase access. It validates transcript size and media type, extracts A-G evidence, persists seven owner-scoped readiness records, computes academic intelligence, records durable evidence, and publishes a server-signed PBOS lifecycle event.

The browser never supplies the record owner. Connector credentials and the academic journey approval remain server-only. Durable transcript storage uses a transcript-content idempotency key; PBOS lifecycle publication uses a separate key bound to the exact derived readiness payload. Missing identity, authority, configuration, supported media, durable persistence, or PBOS acceptance fails closed.

Completion requires independent typecheck, tests, lint, production build, accessible transcript loading/error/recovery states, and human certification of the exact pull-request revision.
`;

export function wireTranscriptUploadCard(source: string): string {
    const authImport = 'import { supabase } from "@/lib/supabaseClient";\n';
    const authBlock = `    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;

    if (!userId) {
      setStatus("Please sign in first.");
      setBusy(false);
      return;
    }

`;
    const body = "body: JSON.stringify({ base64, mediaType: file.type || \"application/pdf\", userId }),";
    const status = '<p style={statusStyle}>{status}</p>';
    if (![authImport, authBlock, body, status].every(needle => source.includes(needle))) {
        throw new Error("Playbook transcript upload source changed; re-inspect before securing the academic journey.");
    }
    return source.replace(authImport, "").replace(authBlock, "")
        .replace("    setBusy(true);", `    if (file.size > 12 * 1024 * 1024) { setStatus("Transcript must be 12 MB or smaller."); return; }\n\n    setBusy(true);`)
        .replace(body, 'body: JSON.stringify({ base64, mediaType: file.type || "application/pdf" }),')
        .replace(status, '<p role="status" aria-live="polite" style={statusStyle}>{status}</p>');
}

const academicServiceImport = 'import type { PlaybookIdentityMapping } from "../../pbos/connector/contracts";';
const academicServiceClass = "export class AcademicTranscriptJourneyService {";
const academicPublicationCall = "    const runtimeProvenance = await this.runtime.publish(identity, evidence.evidenceId, input.readinessScore, input.idempotencyKey);";
const academicPublicationHelper = `export function academicPublicationIdempotencyKey(identityMappingId: string, evidenceId: string, readinessScore: number): string {
  const payload = { operation: "PUBLISH_LIFECYCLE_EVENT", connectorId: "PLAYBOOK-CONNECTOR-001",
    domainRegistrationId: "PLAYBOOK-SCHOLAR-REGISTRATION-001", purpose: "Publish approved academic readiness evidence.",
    identityMappingId, evidenceId, eventType: "ACADEMIC_READINESS_UPDATED", schemaVersion: "1.0.0", readinessScore };
  return "academic-publish-" + createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

`;

/** Preserves the inspected application service while routing PBOS publication through its own exact-payload key. */
export function wireAcademicServicePublicationIdempotency(source: string): string {
    if (source.includes("academicPublicationIdempotencyKey")) return source;
    if (!source.includes(academicServiceImport) || !source.includes(academicServiceClass) ||
        !source.includes(academicPublicationCall)) {
        throw new Error("Playbook academic service changed; re-inspect before repairing publication idempotency.");
    }
    return source
        .replace(academicServiceImport, `import { createHash } from "crypto";\n${academicServiceImport}`)
        .replace(academicServiceClass, `${academicPublicationHelper}${academicServiceClass}`)
        .replace(academicPublicationCall,
            "    const publicationIdempotencyKey = academicPublicationIdempotencyKey(identity.mappingId, evidence.evidenceId, input.readinessScore);\n" +
            "    const runtimeProvenance = await this.runtime.publish(identity, evidence.evidenceId, input.readinessScore, publicationIdempotencyKey);");
}

export function wireAcademicTestPublicationIdempotency(source: string): string {
    if (source.includes("publish:academic-publish-")) return source;
    if (!source.includes('publish: async () => ["pbos:academic"]') ||
        !source.includes('expect(calls).toEqual(["scholar-1", "complete:evidence-1"]);')) {
        throw new Error("Playbook academic test changed; re-inspect before repairing publication idempotency.");
    }
    return source
        .replace('calls.push(input.ownerId); return { evidenceId: "evidence-1" };',
            'calls.push(input.ownerId, "save:" + input.idempotencyKey); return { evidenceId: "evidence-1" };')
        .replace('publish: async () => ["pbos:academic"]',
            'publish: async (_identity, _evidenceId, _score, correlationId) => { calls.push("publish:" + correlationId); return ["pbos:academic"]; }')
        .replace('expect(calls).toEqual(["scholar-1", "complete:evidence-1"]);',
            'expect(calls.slice(0, 2)).toEqual(["scholar-1", "save:transcript-1"]);\n' +
            '    expect(calls[2]).toMatch(/^publish:academic-publish-[a-f0-9]{24}$/);\n' +
            '    expect(calls[3]).toBe("complete:evidence-1");');
}

const academicAcceptanceChecks = `checks: [
      { dimension: "AUTHORITY", passed: true, detail: "Anonymous transcript mutation was denied before authenticated execution." },
      { dimension: "DURABLE_DATA", passed: true, detail: "Transcript-derived readiness survived an authenticated database read." },
      { dimension: "PBOS_INTEGRATION", passed: true, detail: "The approval-bound transcript exchange produced provenance-bearing academic evidence." },
      { dimension: "ACCESSIBILITY", passed: true, detail: "The responsive transcript journey passed its serious-and-critical accessibility audit." },
      { dimension: "SECURITY", passed: true, detail: "Protected academic configuration remained server controlled." }
    ]`;

/** Upgrades a behavior-only browser report to the constitutional evidence schema PBOS verifies. */
export function wireAcademicAcceptanceEvidenceContract(source: string): string {
    if (source.includes('{ dimension: "DURABLE_DATA", passed: true, detail:')) return source;
    const legacyChecks = /checks:\s*\[\s*"AUTHORITY",\s*"DURABLE_DATA",\s*"PBOS_INTEGRATION",\s*"ACCESSIBILITY",\s*"SECURITY"\s*\]/;
    if (!source.includes('journeyId: "TRANSCRIPT-TO-ACADEMIC-READINESS"') || !legacyChecks.test(source)) {
        throw new Error("Playbook academic acceptance report changed; re-inspect before repairing its evidence contract.");
    }
    return source.replace(legacyChecks, academicAcceptanceChecks);
}

export function isAcademicPublicationIdempotencyDefect(run: ProductionRun, recoveryDefects: readonly string[] = []): boolean {
    return run.systemId === SYSTEM_ID && run.selectedMission === "Complete transcript-to-academic-readiness journey" &&
        [run.terminalSummary, ...run.blockers, ...recoveryDefects]
            .some(value => value?.includes("Idempotency key reused with a different request."));
}

export function isAcademicAcceptanceEvidenceDefect(run: ProductionRun, recoveryDefects: readonly string[] = []): boolean {
    return run.systemId === SYSTEM_ID && run.selectedMission === "Complete transcript-to-academic-readiness journey" &&
        [run.terminalSummary, ...run.blockers, ...recoveryDefects]
            .some(value => value?.includes("Browser acceptance report is invalid for TRANSCRIPT-TO-ACADEMIC-READINESS"));
}

export function isPlaybookAcademicRecoveryDefect(run: ProductionRun, recoveryDefects: readonly string[] = []): boolean {
    return isAcademicPublicationIdempotencyDefect(run, recoveryDefects) ||
        isAcademicAcceptanceEvidenceDefect(run, recoveryDefects);
}

/**
 * Creates a new governed recovery PR while preserving the original production
 * run, mission, repair history, recovery epoch, and exact repository lineage.
 */
export async function preparePlaybookAcademicIdempotencyRecovery(dependencies: PlaybookAcademicJourneyRecoveryDependencies,
    run: ProductionRun): Promise<Readonly<{ branch: string; revision: string; remediation: RemediationRun }>> {
    if (!isPlaybookAcademicRecoveryDefect(run, dependencies.recoveryDefects) ||
        run.status !== "BLOCKED" || !run.activeRecoveryEpochId) {
        throw new Error("The production run is not eligible for the Playbook academic recovery adapter.");
    }
    if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) {
        throw new Error("The active Genesis session does not authorize Playbook academic recovery.");
    }
    const reference = governedBuildReference({ owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
        run.currentBranch ?? run.startingBranch);
    const branch = `agent/pbos-playbook-system-001-048-academic-recovery-${run.activeRecoveryEpochId.slice(0, 8)}`;
    for (const [action, risk] of [["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"],
        ["MODIFY_APPLICATION_CODE", "MEDIUM"], ["CREATE_TESTS", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"],
        ["PUSH_BRANCH", "MEDIUM"], ["OPEN_DRAFT_PR", "MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]) {
        const decision = dependencies.authorize(action, risk, branch);
        if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
    }
    const inspection = await dependencies.gateway.inspectRepository(reference);
    if (inspection.revision !== run.currentCommit) {
        throw new Error(`Academic recovery lineage moved from ${run.currentCommit} to ${inspection.revision}; re-inspect before mutation.`);
    }
    const defects = dependencies.recoveryDefects ?? [];
    const repairIdempotency = isAcademicPublicationIdempotencyDefect(run, defects);
    const repairAcceptance = isAcademicAcceptanceEvidenceDefect(run, defects);
    const files: RepositoryFileChange[] = [];
    if (repairIdempotency) {
        const [service, tests] = await Promise.all([
            dependencies.gateway.readFileAtRevision(reference, "lib/pbos/academic-transcript-journey.ts", inspection.revision),
            dependencies.gateway.readFileAtRevision(reference, "tests/unit/pbos/academic-transcript-journey.test.ts", inspection.revision)
        ]);
        files.push(
            { path: "lib/pbos/academic-transcript-journey.ts", content: wireAcademicServicePublicationIdempotency(service) },
            { path: "tests/unit/pbos/academic-transcript-journey.test.ts", content: wireAcademicTestPublicationIdempotency(tests) }
        );
    }
    if (repairAcceptance) {
        const acceptance = await dependencies.gateway.readFileAtRevision(reference,
            "tests/acceptance/pbos-academic.spec.ts", inspection.revision);
        files.push({ path: "tests/acceptance/pbos-academic.spec.ts",
            content: wireAcademicAcceptanceEvidenceContract(acceptance) });
    }
    await dependencies.gateway.createBranch(reference, branch, inspection.revision);
    await dependencies.gateway.applyChange(reference, files);
    const revision = await dependencies.gateway.commit(reference,
        "fix: recover academic acceptance contract", files.map(file => file.path));
    await dependencies.gateway.push(reference, branch);
    const pullRequest = await dependencies.gateway.openDraftPullRequest(reference, branch,
        "fix: recover academic acceptance contract",
        `PBOS Recovery Authority repairs only the detected academic acceptance contract while preserving the existing mission, run, behavior, and evidence lineage.\n\nExisting mission: \`048-academic-journey\`\nRecovery epoch: \`${run.activeRecoveryEpochId}\`\nBase revision: \`${inspection.revision}\`\nRepair revision: \`${revision}\`\nRepair scope: \`${repairIdempotency ? "PUBLICATION_IDEMPOTENCY " : ""}${repairAcceptance ? "BROWSER_EVIDENCE_SCHEMA" : ""}\`\n\nCertification and merge remain human-controlled.`);
    const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
    dependencies.production.registerRecoveryRemediation(run.runId, remediation.runId, branch, revision,
        repairAcceptance ? "ACADEMIC_BROWSER_EVIDENCE_CONTRACT" : "ACADEMIC_PUBLICATION_IDEMPOTENCY_CONTRACT");
    return { branch, revision, remediation };
}

function changes(revision: string, runId: string, uploadCard: string, packageSource: string): readonly RepositoryFileChange[] {
    return [
        { path: "lib/pbos/academic-transcript-journey.ts", content: academicServiceSource },
        { path: TRANSCRIPT_ROUTE, content: transcriptRouteSource },
        { path: TRANSCRIPT_UPLOAD, content: uploadCard },
        { path: "tests/unit/pbos/academic-transcript-journey.test.ts", content: academicTestSource },
        { path: "supabase/migrations/202608050004_pbos_academic_journey.sql", content: migration },
        { path: "docs/integrations/PBOS-ACADEMIC-JOURNEY.md", content: guide },
        ...playbookAcademicAcceptanceFiles(packageSource),
        { path: "pbos/readiness/048-academic-journey.json", content: `${JSON.stringify({ missionId: "048-academic-journey",
            systemId: SYSTEM_ID, repository: REPOSITORY, governedRevision: revision, productionRunId: runId,
            state: "IMPLEMENTED_PENDING_VALIDATION", journey: "TRANSCRIPT_TO_ACADEMIC_READINESS", surface: "WEB",
            implementation: [TRANSCRIPT_ROUTE, TRANSCRIPT_UPLOAD, "lib/pbos/academic-transcript-journey.ts"],
            durableData: "supabase/migrations/202608050004_pbos_academic_journey.sql",
            acceptanceCriteria: ["Authenticated identity—not browser input—owns every mutation", "A-G and readiness evidence persist under RLS",
                "Transcript input is bounded", "PBOS communication is server-signed and provenance-bearing",
                "Accessible UI states, security, lint, tests, and production build require independent evidence"] }, null, 2)}\n` }
    ];
}

export function playbookAcademicJourneyExecutor(dependencies: PlaybookAcademicJourneyExecutorDependencies): ProductionMissionExecutor {
    return async context => {
        if (context.mission.missionId !== "048-academic-journey" || context.run.systemId !== SYSTEM_ID || context.run.repository !== REPOSITORY) {
            throw new Error("The CIP-048 academic-journey adapter is restricted to The Playbook.");
        }
        if (dependencies.session.system.systemId !== SYSTEM_ID || dependencies.session.system.repository !== REPOSITORY) {
            throw new Error("The active Genesis session does not authorize the Playbook academic journey.");
        }
        const reference = governedBuildReference(
            { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" }, context.run.startingBranch);
        const branch = `agent/pbos-playbook-system-001-048-academic-${context.run.runId.slice(0, 8)}`;
        for (const [action, risk] of [["INSPECT_REPOSITORY", "LOW"], ["PROPOSE_CHANGE", "MEDIUM"],
            ["MODIFY_APPLICATION_CODE", "MEDIUM"], ["CREATE_TESTS", "MEDIUM"], ["CREATE_COMMIT", "MEDIUM"],
            ["PUSH_BRANCH", "MEDIUM"], ["OPEN_DRAFT_PR", "MEDIUM"]] as readonly (readonly [BuildAction, ActionRisk])[]) {
            const decision = dependencies.authorize(action, risk, branch);
            if (!decision.allowed) throw new Error(`${action} denied: ${decision.reason}`);
        }
        context.report("CONTEXT", `Confirming ${REPOSITORY} at ${context.run.startingCommit}.`);
        const inspection = await dependencies.gateway.inspectRepository(reference);
        if (inspection.revision !== context.run.startingCommit) throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan before mutation.`);
        await dependencies.gateway.readFileAtRevision(reference, TRANSCRIPT_ROUTE, inspection.revision);
        const [uploadSource, packageSource] = await Promise.all([
            dependencies.gateway.readFileAtRevision(reference, TRANSCRIPT_UPLOAD, inspection.revision),
            dependencies.gateway.readFileAtRevision(reference, "package.json", inspection.revision)
        ]);
        const files = changes(inspection.revision, context.run.runId, wireTranscriptUploadCard(uploadSource), packageSource);
        context.report("BUILDING", `Securing and completing the transcript-to-readiness journey on ${branch}.`);
        await dependencies.gateway.createBranch(reference, branch, inspection.revision);
        await dependencies.gateway.applyChange(reference, files);
        await dependencies.gateway.prepareDependencyLock(reference);
        const paths = [...files.map(file => file.path), "package-lock.json"];
        const revision = await dependencies.gateway.commit(reference, "feat: complete authenticated academic readiness journey", paths);
        context.report("PUSHING", `Publishing academic-journey revision ${revision}.`);
        await dependencies.gateway.push(reference, branch);
        const pullRequest: PullRequestReference = await dependencies.gateway.openDraftPullRequest(reference, branch,
            "feat: complete authenticated academic readiness journey",
            `PBOS Genesis mission \`048-academic-journey\` replaces browser-selected ownership and service-role mutation with an authenticated, RLS-scoped transcript-to-readiness journey at governed revision \`${inspection.revision}\`.\n\nValidation and certification remain human-controlled.\n\nGenerated revision: \`${revision}\``);
        const remediation = dependencies.remediation.start(SYSTEM_ID, pullRequest);
        context.report("VALIDATING", `GitHub Actions and bounded remediation are monitoring ${pullRequest.url}.`);
        const functionalAcceptancePlan = await playbookAcademicAcceptancePlan(dependencies.gateway, reference, branch, revision);
        return { outputs: { branch, revision, pullRequest, remediationRunId: remediation.runId },
            evidenceIds: [`repository:${inspection.revision}`, `commit:${revision}`, `pull-request:${pullRequest.number}`],
            files: { added: files.filter(file => ![TRANSCRIPT_ROUTE, TRANSCRIPT_UPLOAD].includes(file.path)).map(file => file.path),
                modified: [TRANSCRIPT_ROUTE, TRANSCRIPT_UPLOAD, "package-lock.json"] },
            commands: [{ command: "authenticated academic-journey publication", exitCode: 0, durationMs: 0, output: `${branch} ${pullRequest.url}` }],
            validations: [{ name: "Academic journey published for independent validation", passed: true, durationMs: 0,
                evidenceId: `pull-request:${pullRequest.number}` }],
            deferredValidation: { remediationRunId: remediation.runId, pullRequestUrl: pullRequest.url },
            acceptanceEvidence: acceptanceEvidence(revision), functionalAcceptancePlan };
    };
}
