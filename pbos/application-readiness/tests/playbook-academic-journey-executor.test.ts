import { describe, expect, it } from "vitest";
import { GitHubRepositoryGateway } from "../../platform";
import { ProductionRun } from "../../production-runtime";
import { playbookAcademicJourneyExecutor, preparePlaybookAcademicIdempotencyRecovery,
    isAcademicAcceptanceEvidenceDefect, isAcademicAcceptanceNetworkDefect, isPlaybookAcademicRecoveryDefect,
    wireAcademicAcceptanceEvidenceContract, wireAcademicAcceptanceNetworkRetry,
    wireAcademicServicePublicationIdempotency,
    wireAcademicTestPublicationIdempotency, wireTranscriptUploadCard } from "../playbook-academic-journey-executor";

const uploadCard = `import { supabase } from "@/lib/supabaseClient";
async function handleFile(file?: File) {
    if (!file) return;

    setBusy(true);
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;

    if (!userId) {
      setStatus("Please sign in first.");
      setBusy(false);
      return;
    }

    const base64 = await fileToBase64(file);
    await fetch("/api/parse-transcript", {
      body: JSON.stringify({ base64, mediaType: file.type || "application/pdf", userId }),
    });
}
return <p style={statusStyle}>{status}</p>;
`;

const session = {
    sessionId: "session-academic", activatedAt: new Date(),
    system: { systemId: "PLAYBOOK-SYSTEM-001", operatingSystemId: "PLAYBOOK-OS-001", name: "The Playbook",
        domain: "Education", repository: "sgwalton87/playbook-platform", defaultBranch: "main", status: "READY" as const, capabilities: [] },
    grant: { grantId: "grant-academic", systemId: "PLAYBOOK-SYSTEM-001", repository: "sgwalton87/playbook-platform",
        branchPattern: "agent/*", mode: "DELEGATED_AUTONOMY" as const, allowedActions: [], deniedActions: [], maximumRisk: "MEDIUM" as const,
        issuedBy: "operator", issuanceApprovalId: "approval", issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }
};
const run = { runId: "12345678-aaaa-bbbb-cccc-123456789012", systemId: "PLAYBOOK-SYSTEM-001",
    repository: "sgwalton87/playbook-platform", startingCommit: "836e6ae" } as ProductionRun;
const mission = { missionId: "048-academic-journey", systemId: "PLAYBOOK-SYSTEM-001", title: "Complete transcript-to-academic-readiness journey",
    dependencies: ["048-scholar-slice"], status: "ACTIVE" as const, rationale: "Scholar slice complete.", approvalRequired: true, evidenceIds: [] };

describe("CIP-048 academic journey execution adapter", () => {
    it("replaces browser-selected ownership with authenticated RLS and PBOS evidence", async () => {
        const calls: string[] = [];
        const generated = new Map<string, string>();
        const gateway = {
            inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
                revision: "836e6ae", findings: [], files: [], inspectedAt: new Date() }),
            readFileAtRevision: async (_reference: unknown, path: string, revision: string) => {
                calls.push(`read:${revision}:${path}`);
                if (path.includes("TranscriptUploadCard")) return uploadCard;
                if (path === "package.json") return JSON.stringify({ scripts: { dev: "next dev" }, devDependencies: {} });
                return "legacy route";
            },
            createBranch: async (_reference: unknown, branch: string) => { calls.push(`branch:${branch}`); return branch; },
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); calls.push("files"); return files.map(file => file.path);
            },
            prepareDependencyLock: async () => { calls.push("lock"); },
            workingDirectory: async () => "/tmp/playbook-platform",
            commit: async () => { calls.push("commit"); return "academic123"; },
            push: async () => { calls.push("push"); },
            openDraftPullRequest: async () => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/54", number: 54,
                branch: "agent/pbos-playbook-system-001-048-academic-12345678", repository: "sgwalton87/playbook-platform" })
        } as unknown as GitHubRepositoryGateway;
        const executor = playbookAcademicJourneyExecutor({ gateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-academic", action, allowed: true, reason: "authorized", decidedAt: new Date() }),
            remediation: { start: (_systemId, pullRequest) => ({ runId: "validation-academic", systemId: "PLAYBOOK-SYSTEM-001", pullRequest,
                headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS", evidence: [], blockers: [], updatedAt: new Date().toISOString() }) } });
        const result = await executor({ run, mission, report: () => undefined });
        expect(calls).toEqual(expect.arrayContaining(["read:836e6ae:app/api/parse-transcript/route.ts", "files", "lock", "commit", "push"]));
        const route = generated.get("app/api/parse-transcript/route.ts") ?? "";
        expect(route).toContain("requireUser");
        expect(route).toContain("user_id: user.id");
        expect(route).not.toContain("userId?: unknown");
        expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        const upload = generated.get("components/transcript/TranscriptUploadCard.tsx") ?? "";
        expect(upload).not.toContain("userId" );
        expect(upload).toContain('role="status"');
        expect(upload).toContain("12 MB or smaller");
        expect(generated.get("supabase/migrations/202608050004_pbos_academic_journey.sql")).toContain("enable row level security");
        expect(generated.get("tests/acceptance/pbos-academic.spec.ts")).toContain("TRANSCRIPT-TO-ACADEMIC-READINESS");
        expect(generated.get("package.json")).toContain("test:acceptance:pbos:academic");
        expect(generated.get("pbos/readiness/048-academic-journey.json")).toContain("IMPLEMENTED_PENDING_VALIDATION");
        expect(result.files?.modified).toContain("app/api/parse-transcript/route.ts");
        expect(result.deferredValidation?.pullRequestUrl).toContain("/pull/54");
        expect(result.functionalAcceptancePlan).toMatchObject({ commit: "academic123",
            journeyId: "TRANSCRIPT-TO-ACADEMIC-READINESS" });
    });

    it("fails closed when the governed transcript UI no longer matches the inspected source", () => {
        expect(() => wireTranscriptUploadCard("changed component")).toThrow("re-inspect");
    });

    it("separates transcript persistence from exact-payload PBOS publication inside the domain service", () => {
        const service = `import type { PlaybookIdentityMapping } from "../../pbos/connector/contracts";\n` +
            `export class AcademicTranscriptJourneyService {\n` +
            `async complete(input: { actorId: string; ownerId: string; approvalId: string; readinessScore: number; agUpdates: number; idempotencyKey: string }) {\n` +
            `    if (!input.idempotencyKey.trim()) throw new Error("Academic journey idempotency key required.");\n` +
            `    const runtimeProvenance = await this.runtime.publish(identity, evidence.evidenceId, input.readinessScore, input.idempotencyKey);\n}`;
        const tests = `publish: async () => ["pbos:academic"]\n` +
            `readinessScore: 82, agUpdates: 7, idempotencyKey: "transcript-1" });\n` +
            `expect(calls).toEqual(["scholar-1", "complete:evidence-1"]);\n` +
            `agUpdates: 7, idempotencyKey: "key" })).rejects.toThrow("Access denied");`;
        const repairedService = wireAcademicServicePublicationIdempotency(service);
        expect(repairedService).toContain('import { createHash } from "crypto"');
        expect(repairedService).toContain("academicPublicationIdempotencyKey(identity.mappingId, evidence.evidenceId");
        expect(repairedService).toContain('eventType: "ACADEMIC_READINESS_UPDATED"');
        expect(wireAcademicTestPublicationIdempotency(tests)).toContain("publish:academic-publish-");
        expect(wireAcademicServicePublicationIdempotency(repairedService)).toBe(repairedService);
    });

    it("upgrades academic browser checks to detailed constitutional evidence", () => {
        const legacy = `journeyId: "TRANSCRIPT-TO-ACADEMIC-READINESS",\n` +
            `checks: ["AUTHORITY", "DURABLE_DATA", "PBOS_INTEGRATION", "ACCESSIBILITY", "SECURITY"]`;
        const repaired = wireAcademicAcceptanceEvidenceContract(legacy);
        expect(repaired).toContain('{ dimension: "DURABLE_DATA", passed: true, detail:');
        expect(repaired).toContain('{ dimension: "PBOS_INTEGRATION", passed: true, detail:');
        expect(wireAcademicAcceptanceEvidenceContract(repaired)).toBe(repaired);
        expect(() => wireAcademicAcceptanceEvidenceContract("changed report"))
            .toThrow("re-inspect before repairing its evidence contract");
    });

    it("recognizes the exact academic browser evidence defect without broadening recovery scope", () => {
        const blocked = { ...run, status: "BLOCKED", selectedMission: "Complete transcript-to-academic-readiness journey",
            blockers: ["Browser acceptance report is invalid for TRANSCRIPT-TO-ACADEMIC-READINESS: DURABLE_DATA."] } as ProductionRun;
        expect(isAcademicAcceptanceEvidenceDefect(blocked)).toBe(true);
        expect(isPlaybookAcademicRecoveryDefect(blocked)).toBe(true);
        expect(isPlaybookAcademicRecoveryDefect({ ...blocked, selectedMission: "Different mission" })).toBe(false);
    });

    it("adds transient-only bounded Supabase retries to academic acceptance", () => {
        const source = `const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error("Missing PBOS academic acceptance configuration: " + name);
  return value;
};
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  const progress = await admin.from("ag_progress").select("user_id,subject").eq("user_id", user.id);
  if (progress.error) throw progress.error;
  const evidence = await admin.from("academic_journey_evidence")
    .select("owner_id,readiness_score,ag_updates,delivery_state,provenance")
    .eq("owner_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (evidence.error) throw evidence.error;`;
        const repaired = wireAcademicAcceptanceNetworkRetry(source);
        expect(repaired).toContain("attempt <= 3");
        expect(repaired).toContain("isTransientSupabaseFailure");
        expect(repaired).toContain('withSupabaseRetry("Acceptance identity lookup"');
        expect(repaired).toContain('withSupabaseRetry("Academic evidence verification"');
        expect(wireAcademicAcceptanceNetworkRetry(repaired)).toBe(repaired);
    });

    it("recognizes only a transient network failure for the academic browser journey", () => {
        const blocked = { ...run, status: "BLOCKED", selectedMission: "Complete transcript-to-academic-readiness journey",
            blockers: ["Browser journey command failed for TRANSCRIPT-TO-ACADEMIC-READINESS: TypeError: fetch failed; UND_ERR_CONNECT_TIMEOUT"] } as ProductionRun;
        expect(isAcademicAcceptanceNetworkDefect(blocked)).toBe(true);
        expect(isPlaybookAcademicRecoveryDefect(blocked)).toBe(true);
        expect(isAcademicAcceptanceNetworkDefect({ ...blocked, blockers: ["Authorization denied"] })).toBe(false);
    });

    it("prepares one recovery PR on the existing mission and authorized recovery epoch", async () => {
        const generated = new Map<string, string>();
        const calls: string[] = [];
        const recoveryRun = { ...run, status: "BLOCKED", currentBranch: "main", currentCommit: "abcdef1",
            selectedMission: "Complete transcript-to-academic-readiness journey",
            activeRecoveryEpochId: "epoch1234-aaaa-bbbb-cccc", blockers: [] } as ProductionRun;
        const serviceSource = `import type { PlaybookIdentityMapping } from "../../pbos/connector/contracts";\n` +
            `export class AcademicTranscriptJourneyService {\n` +
            `async complete(input: { actorId: string; ownerId: string; approvalId: string; readinessScore: number; agUpdates: number; idempotencyKey: string }) {\n` +
            `    if (!input.idempotencyKey.trim()) throw new Error("Academic journey idempotency key required.");\n` +
            `    const runtimeProvenance = await this.runtime.publish(identity, evidence.evidenceId, input.readinessScore, input.idempotencyKey);\n}`;
        const testSource = `publish: async () => ["pbos:academic"]\n` +
            `readinessScore: 82, agUpdates: 7, idempotencyKey: "transcript-1" });\n` +
            `expect(calls).toEqual(["scholar-1", "complete:evidence-1"]);\n` +
            `agUpdates: 7, idempotencyKey: "key" })).rejects.toThrow("Access denied");`;
        const gateway = {
            inspectRepository: async () => ({ repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: "main" },
                revision: "abcdef1", findings: [], files: [], inspectedAt: new Date() }),
            readFileAtRevision: async (_reference: unknown, path: string) => path.includes("tests/unit") ? testSource : serviceSource,
            createBranch: async (_reference: unknown, branch: string) => { calls.push(`branch:${branch}`); return branch; },
            applyChange: async (_reference: unknown, files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path);
            },
            commit: async () => "fedcba2", push: async () => undefined,
            openDraftPullRequest: async (_reference: unknown, branch: string) => ({ url: "https://github.com/sgwalton87/playbook-platform/pull/57",
                number: 57, branch, repository: "sgwalton87/playbook-platform" })
        } as unknown as GitHubRepositoryGateway;
        const remediation = { runId: "recovery-validation", systemId: "PLAYBOOK-SYSTEM-001",
            pullRequest: { url: "https://github.com/sgwalton87/playbook-platform/pull/57", number: 57,
                branch: "agent/pbos-playbook-system-001-048-academic-recovery-epoch123", repository: "sgwalton87/playbook-platform" },
            headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS", evidence: [], blockers: [],
            updatedAt: new Date().toISOString() } as const;
        const result = await preparePlaybookAcademicIdempotencyRecovery({ gateway, session,
            remediation: { start: () => remediation }, production: { registerRecoveryRemediation: (...args) => {
                calls.push(`register:${args[0]}:${args[1]}:${args[3]}`); return recoveryRun;
            } }, recoveryDefects: ["Idempotency key reused with a different request."],
            authorize: action => ({ decisionId: action, grantId: "grant-academic", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }) }, recoveryRun);
        expect(result).toMatchObject({ revision: "fedcba2", remediation: { runId: "recovery-validation" } });
        expect(generated.has("app/api/parse-transcript/route.ts")).toBe(false);
        expect(generated.get("lib/pbos/academic-transcript-journey.ts")).toContain("academicPublicationIdempotencyKey");
        expect(calls).toContain("register:12345678-aaaa-bbbb-cccc-123456789012:recovery-validation:fedcba2");
    });

    it("prepares an evidence-only recovery without rewriting proven academic behavior", async () => {
        const generated = new Map<string, string>();
        const calls: string[] = [];
        const recoveryRun = { ...run, status: "BLOCKED", currentBranch: "agent/previous", currentCommit: "abcdef2",
            selectedMission: "Complete transcript-to-academic-readiness journey",
            activeRecoveryEpochId: "epoch5678-aaaa-bbbb-cccc", blockers: [] } as ProductionRun;
        const acceptance = `journeyId: "TRANSCRIPT-TO-ACADEMIC-READINESS",\n` +
            `checks: ["AUTHORITY", "DURABLE_DATA", "PBOS_INTEGRATION", "ACCESSIBILITY", "SECURITY"]`;
        const gateway = {
            inspectRepository: async (reference: { defaultBranch: string }) => {
                calls.push(`inspect:${reference.defaultBranch}`);
                return { repository: { owner: "sgwalton87", name: "playbook-platform", defaultBranch: reference.defaultBranch },
                    revision: "abcdef2", findings: [], files: [], inspectedAt: new Date() };
            },
            readFileAtRevision: async (_reference: unknown, path: string) => { calls.push(`read:${path}`); return acceptance; },
            createBranch: async () => "branch", applyChange: async (_reference: unknown,
                files: readonly { path: string; content: string }[]) => {
                files.forEach(file => generated.set(file.path, file.content)); return files.map(file => file.path);
            },
            commit: async () => "fedcba3", push: async () => undefined,
            openDraftPullRequest: async (_reference: unknown, branch: string) => ({
                url: "https://github.com/sgwalton87/playbook-platform/pull/58", number: 58, branch,
                repository: "sgwalton87/playbook-platform" })
        } as unknown as GitHubRepositoryGateway;
        const remediation = { runId: "evidence-recovery", systemId: "PLAYBOOK-SYSTEM-001",
            pullRequest: { url: "https://github.com/sgwalton87/playbook-platform/pull/58", number: 58,
                branch: "agent/pbos-playbook-system-001-048-academic-recovery-epoch5678", repository: "sgwalton87/playbook-platform" },
            headSha: "UNKNOWN", attempt: 0, maximumAttempts: 5, state: "WAITING_FOR_CHECKS", evidence: [], blockers: [],
            updatedAt: new Date().toISOString() } as const;
        await preparePlaybookAcademicIdempotencyRecovery({ gateway, session,
            remediation: { start: () => remediation }, production: { registerRecoveryRemediation: (...args) => {
                calls.push(`register:${args[4]}`); return recoveryRun;
            } }, recoveryDefects: ["Browser acceptance report is invalid for TRANSCRIPT-TO-ACADEMIC-READINESS: DURABLE_DATA."],
            authorize: action => ({ decisionId: action, grantId: "grant-academic", action, allowed: true,
                reason: "authorized", decidedAt: new Date() }) }, recoveryRun);
        expect([...generated.keys()]).toEqual(["tests/acceptance/pbos-academic.spec.ts"]);
        expect(generated.get("tests/acceptance/pbos-academic.spec.ts")).toContain('dimension: "DURABLE_DATA"');
        expect(calls).toContain("inspect:agent/previous");
        expect(calls).not.toContain("read:lib/pbos/academic-transcript-journey.ts");
        expect(calls).toContain("register:ACADEMIC_BROWSER_EVIDENCE_CONTRACT");
    });

    it("fails before repository inspection when authority is denied", async () => {
        const executor = playbookAcademicJourneyExecutor({ gateway: {} as GitHubRepositoryGateway, session,
            authorize: action => ({ decisionId: action, grantId: "grant-academic", action, allowed: false, reason: "revoked", decidedAt: new Date() }),
            remediation: { start: () => { throw new Error("not reached"); } } });
        await expect(executor({ run, mission, report: () => undefined })).rejects.toThrow("denied: revoked");
    });
});
