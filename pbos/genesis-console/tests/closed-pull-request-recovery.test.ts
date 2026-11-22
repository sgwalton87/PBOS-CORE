import { linkSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { BuildAuthorityService } from "../../autonomous-authority";
import { GenesisStateRepository, OperatorIdentityService, PersistentBuildGrantRegistry } from "../../genesis-state";
import { BackgroundMonitor } from "../../operator-continuity";
import { FunctionalAcceptancePlan, ProductionRuntimeService } from "../../production-runtime";
import { GitHubCheckCollector, RemediationRun, ResumableRemediationEngine } from "../../validation-automation";
import { assertIsolatedRecoveryState, CLOSED_PR_RECOVERY_ACTION, prepareClosedPullRequestRecovery,
    registerClosedPullRequestRecovery, verifyClosedPullRequestRecoveryApproval, prepareRegisteredRecoveryRenewal, renewRegisteredRecovery,
    recoveryApprovalDuration, MAX_RECOVERY_APPROVAL_MINUTES, preflightRecoveryBrowser, rebindRegisteredRecoveryGrant } from "../closed-pull-request-recovery";
import { GenesisControlPlane } from "../genesis-control-plane";
import { GenesisSystemCatalog } from "../system-catalog";
import { REFERENCE_SYSTEMS } from "../system-definition";
import { verifyHostedRecoveryEvidence } from "../hosted-recovery-verifier";

const system = REFERENCE_SYSTEMS.find(item => item.systemId === "PLAYBOOK-SYSTEM-001")!;
const base = "a".repeat(40), oldCommit = "b".repeat(40), closedHead = "c".repeat(40), head = "d".repeat(40);
const branch = "agent/replacement";
const title = "Recover Hostinger Email";

function fixture() {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "pbos-replacement-")));
    const state = new GenesisStateRepository(join(directory, "genesis-state.json"));
    const identities = new OperatorIdentityService(join(directory, "operators.json"));
    const identity = identities.enroll("synthetic", "Fixture operator");
    const operator = identities.authenticate(identity.operator.operatorId, identity.credential);
    const control = new GenesisControlPlane(new GenesisSystemCatalog([system]),
        new BuildAuthorityService(new PersistentBuildGrantRegistry(state)), state);
    const issuance = identities.approve(operator, "ISSUE_BUILD_GRANT", system.systemId);
    const session = control.activateSystem(system.systemId, "HUMAN_GATED", operator.operatorId, issuance.approvalId);
    const production = new ProductionRuntimeService(state);
    const started = production.begin({ systemId: system.systemId, actorId: operator.operatorId,
        authorizationArtifactId: "historical-approval", repository: system.repository, branch: "main",
        commit: base, objective: title, mission: title, rationale: "fixture" });
    production.transition(started.runId, "BLOCKED", "Historical proposal closed.");
    const before = { ...state.productionRun(started.runId)!, currentBranch: "agent/historical",
        currentCommit: oldCommit, repairAttempts: 1, repairAttemptLimit: 5, evidenceIds: ["remediation-run:historical"],
        functionalAcceptancePlan: {
            workingDirectory: "/old-checkout", browserJourneys: [], probes: [],
            launch: { command: "npm", args: ["run", "dev"], healthPath: "/api/invitations/send" },
        } as unknown as FunctionalAcceptancePlan };
    state.saveProductionRun(before);
    state.saveMissionQueue([{ systemId: system.systemId, missionId: "048-phase-01-item-hostinger-email",
        title, status: "BLOCKED", dependencies: [], rationale: "fixture", approvalRequired: true, evidenceIds: [],
        completionPolicy: { kind: "FUNCTIONAL_APPLICATION", requiredDimensions: [], certificationCriteria: [] } }] as never, system.systemId);
    const historical: RemediationRun = { runId: "historical", systemId: system.systemId,
        pullRequest: { repository: system.repository, url: "https://github.com/sgwalton87/playbook-platform/pull/88",
            branch: before.currentBranch, number: 88 }, headSha: closedHead, attempt: 1, maximumAttempts: 5,
        state: "BLOCKED", evidence: [], blockers: [], updatedAt: new Date().toISOString() };
    state.saveRemediationRun(historical);
    const run = vi.fn(async (command: string, args: readonly string[]) => {
        let stdout: string;
        if (command === "git") {
            stdout = args.includes("--show-toplevel") ? directory : args.includes("HEAD") ? head :
                args[0] === "branch" ? branch : args[0] === "merge-base" ? base : "";
        } else if (args[0] === "pr") stdout = JSON.stringify({ headRefOid: head, state: "OPEN", baseRefName: "main" });
        else if (args[1].endsWith("/check-runs")) stdout = JSON.stringify({ check_runs: [{
            name: "CI", status: "completed", conclusion: "success",
            details_url: "https://github.com/sgwalton87/playbook-platform/actions/runs/1/job/2",
        }] });
        else if (/actions\/runs\//.test(args[1])) stdout = JSON.stringify({ attempt: 1, jobs: [] });
        else {
            const old = args[1].endsWith("/88");
            stdout = JSON.stringify({ state: old ? "closed" : "open", merged: false,
                base: { ref: "main", sha: base }, head: { ref: old ? before.currentBranch : branch,
                    sha: old ? closedHead : head, repo: { full_name: system.repository } } });
        }
        return { stdout, stderr: "" };
    });
    const prepare = (commit = head) => prepareClosedPullRequestRecovery(state, { run }, before.runId, 999, base, commit, directory);
    return { state, identities, operator, control, session, historical, before, directory, prepare, run };
}

describe("governed closed pull request recovery", () => {
    it("verifies a hosted result against local authority, GitHub identity, exact PR and archive bytes", async () => {
        const f = fixture();
        const prepared = await f.prepare();
        const approval = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, prepared.resource);
        registerClosedPullRequestRecovery(f.state, f.control, f.identities, f.operator, f.session, approval, prepared, f.directory);
        const checkpoint = { runId: f.before.runId, githubRunId: 123, coreSha: "f".repeat(40), platformSha: head,
            baseSha: base, pullRequest: 999, workflowPath: ".github/workflows/pbos-core-readonly-preflight.yml", actorId: 456, nonce: "1".repeat(64) };
        const receipt = { schemaVersion: 1, runId: checkpoint.runId, nonce: checkpoint.nonce, platformSha: head,
            pullRequest: 999, githubRunId: 123, checks: ["ROUTE", "AUTHORITY", "DURABLE_DATA", "PBOS_INTEGRATION", "SECURITY"]
                .map(dimension => ({ dimension, passed: true, detail: "fixture verified" })) };
        writeFileSync(join(f.directory, "receipt.json"), JSON.stringify(receipt));
        const evidenceFiles = ["receipt.json", "desktop.png", "mobile.png", "trace.zip", "accessibility.json", "playwright-results.json"];
        for (const name of evidenceFiles.slice(1)) writeFileSync(join(f.directory, name), "fixture evidence");
        execFileSync("zip", ["-q", "evidence.zip", ...evidenceFiles], { cwd: f.directory });
        const archive = readFileSync(join(f.directory, "evidence.zip"));
        const metadata = { id: 123, event: "workflow_dispatch", status: "completed", conclusion: "success", head_sha: checkpoint.coreSha,
            run_attempt: 1, path: checkpoint.workflowPath, actor: { id: 456 }, repository: { id: 1321290119, full_name: "sgwalton87/PBOS-CORE" },
            created_at: new Date(Date.now() + 1000).toISOString() };
        const pr = { state: "open", merged: false, base: { sha: base }, head: { sha: head, repo: { full_name: system.repository } } };
        const artifact = { name: `hostinger-acceptance-${checkpoint.nonce}`, expired: false,
            digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`, workflow_run: { id: 123, head_sha: checkpoint.coreSha } };
        const jobs = { jobs: [{ name: "hostinger-governed-acceptance", status: "completed", conclusion: "success",
            steps: [{ name: "Run exact Hostinger acceptance", conclusion: "success" }] }] };
        const run = vi.fn(async (_command: string, args: readonly string[]) => ({ stdout: JSON.stringify(
            args[1].endsWith("/artifacts") ? { artifacts: [artifact] } : args[1].includes("/jobs?") ? jobs : args[1].includes("/pulls/") ? pr : metadata), stderr: "" }));
        const input = { state: f.state, identities: f.identities, operator: f.operator, session: f.session, control: f.control,
            approval, resource: prepared.resource, checkpoint, commands: { run }, archive };
        await expect(verifyHostedRecoveryEvidence(input)).resolves.toBeUndefined();
        await expect(verifyHostedRecoveryEvidence({ ...input, archive: Buffer.from("tampered") })).rejects.toThrow(/digest/);
        await expect(verifyHostedRecoveryEvidence({ ...input, checkpoint: { ...checkpoint, platformSha: "9".repeat(40) } })).rejects.toThrow(/scope/);
        jobs.jobs[0].conclusion = "failure";
        await expect(verifyHostedRecoveryEvidence(input)).rejects.toThrow(/acceptance job/);
        jobs.jobs[0].conclusion = "success";
        pr.head.sha = "9".repeat(40);
        await expect(verifyHostedRecoveryEvidence(input)).rejects.toThrow(/PR moved/);
        pr.head.sha = head;
        metadata.actor.id = 999;
        await expect(verifyHostedRecoveryEvidence(input)).rejects.toThrow(/run identity/);
        metadata.actor.id = 456;
        f.control.revokeSession(f.session.sessionId, "fixture revocation");
        await expect(verifyHostedRecoveryEvidence(input)).rejects.toThrow(/grant/);
        expect(f.state.productionRun(f.before.runId)?.repairAttempts).toBe(1);
    });
    it("fails browser environment preflight before changing the recovery or repair budget", async () => {
        const f = fixture();
        const before = f.state.productionRun(f.before.runId);
        const commands = { run: vi.fn().mockRejectedValue(new Error("missing FFmpeg")) };
        await expect(preflightRecoveryBrowser(commands, f.directory)).rejects.toThrow(/preflight failed.*missing FFmpeg/);
        expect(commands.run).toHaveBeenCalledWith(process.execPath, expect.any(Array), f.directory, { timeoutMs: 60_000 });
        expect(f.state.productionRun(f.before.runId)).toEqual(before);
        expect(f.state.productionRun(f.before.runId)?.repairAttempts).toBe(1);
    });
    it("preserves the old PR and repair budget while attaching only the signed exact head", async () => {
        const f = fixture();
        const prepared = await f.prepare();
        const approval = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, prepared.resource);
        const replacement = registerClosedPullRequestRecovery(f.state, f.control, f.identities, f.operator, f.session,
            approval, prepared, f.directory);
        expect(f.state.remediationRun("historical")).toEqual(f.historical);
        expect(replacement).toMatchObject({ headSha: head, attempt: 1, maximumAttempts: 5 });
        expect(f.state.productionRun(f.before.runId)).toMatchObject({
            status: "BLOCKED", currentCommit: head, currentBranch: branch, repairAttempts: 1, repairAttemptLimit: 5,
            functionalAcceptancePlan: { workingDirectory: f.directory, commit: head, localSyntheticHostingerRecovery: true },
            evidenceIds: ["remediation-run:historical", `remediation-run:${replacement.runId}`],
        });
        expect(f.state.audit().filter(item => item.eventId === approval.approvalId)).toHaveLength(1);
        expect(new ProductionRuntimeService(f.state).verifyIntegrity().valid).toBe(true);
        expect(() => registerClosedPullRequestRecovery(f.state, f.control, f.identities, f.operator, f.session,
            approval, prepared, f.directory)).toThrow(/changed before registration/);

        const apply = vi.fn();
        const engine = new ResumableRemediationEngine(f.state, {
            collectPinnedReplacement: vi.fn().mockResolvedValue({ pullRequestState: "OPEN", headSha: oldCommit, evidence: [] }),
        } as unknown as GitHubCheckCollector, { apply } as never);
        expect((await engine.resume(replacement.runId)).state).toBe("BLOCKED");
        expect(f.state.remediationRun(replacement.runId)?.headSha).toBe(head);
        expect(apply).not.toHaveBeenCalled();
        const monitor = new BackgroundMonitor(f.state, engine, {} as never, {} as never);
        await expect(monitor.run(replacement.runId, f.session.sessionId)).rejects.toThrow(/verified operator authority/);
        const validating = { ...f.state.productionRun(f.before.runId)!, status: "VALIDATING" as const };
        f.state.saveProductionRun(validating);
        const reconcile = monitor as unknown as { reconcileProductionMission(remediation: RemediationRun): Promise<void> };
        await reconcile.reconcileProductionMission(f.historical);
        expect(f.state.productionRun(f.before.runId)).toEqual(validating);
    });

    it("renews only the registered exact scope without changing the run or budget", async () => {
        const f = fixture();
        const prepared = await f.prepare();
        const initial = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, prepared.resource);
        const replacement = registerClosedPullRequestRecovery(f.state, f.control, f.identities, f.operator, f.session,
            initial, prepared, f.directory);
        const before = f.state.productionRun(f.before.runId);
        const refreshed = await prepareRegisteredRecoveryRenewal(f.state, { run: f.run }, f.before.runId);
        const signed = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, refreshed.binding.resource);
        renewRegisteredRecovery(f.state, f.control, f.identities, f.operator, f.session, signed, refreshed);
        expect(f.state.productionRun(f.before.runId)).toEqual(before);
        expect(f.state.remediationRun(replacement.runId)?.closedPullRequestReplacement?.approvalId).toBe(signed.approvalId);
        expect(f.state.remediationRun("historical")).toEqual(f.historical);
        expect(() => renewRegisteredRecovery(f.state, f.control, f.identities, f.operator, f.session, signed, refreshed))
            .toThrow(/changed before approval renewal/);
    });

    it("rejects a moved head, modified signature, and expired approval", async () => {
        const f = fixture();
        await expect(f.prepare("e".repeat(40))).rejects.toThrow(/identities/);
        const prepared = await f.prepare();
        const approval = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, prepared.resource);
        expect(() => verifyClosedPullRequestRecoveryApproval(f.identities, f.operator, f.session,
            { ...approval, signature: "invalid" }, prepared.resource)).toThrow(/operator-signed/);
        expect(() => verifyClosedPullRequestRecoveryApproval(f.identities, f.operator, f.session,
            approval, prepared.resource, new Date(approval.expiresAt))).toThrow(/operator-signed/);
        expect(f.state.productionRun(f.before.runId)?.currentCommit).toBe(oldCommit);
    });

    it("bounds configurable renewal duration and verifies a 30-day exact-scope signature", async () => {
        expect(recoveryApprovalDuration(undefined)).toBe(30);
        expect(recoveryApprovalDuration("43200")).toBe(MAX_RECOVERY_APPROVAL_MINUTES);
        for (const value of ["0", "43201", "1.5", "-1", "Infinity", ""]) {
            expect(() => recoveryApprovalDuration(value)).toThrow(/duration/);
        }
        const f = fixture();
        const prepared = await f.prepare();
        const initial = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, prepared.resource);
        const replacement = registerClosedPullRequestRecovery(f.state, f.control, f.identities, f.operator, f.session,
            initial, prepared, f.directory);
        const renewed = await prepareRegisteredRecoveryRenewal(f.state, { run: f.run }, f.before.runId);
        const signed = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, renewed.binding.resource, 43200);
        expect(Date.parse(signed.expiresAt) - Date.parse(signed.issuedAt)).toBeGreaterThanOrEqual(43200 * 60_000);
        expect(f.identities.verify(signed, CLOSED_PR_RECOVERY_ACTION, renewed.binding.resource,
            new Date(Date.parse(signed.expiresAt) - 1))).toBe(true);
        expect(f.identities.verify(signed, CLOSED_PR_RECOVERY_ACTION, renewed.binding.resource,
            new Date(signed.expiresAt))).toBe(false);
        expect(f.identities.verify(signed, CLOSED_PR_RECOVERY_ACTION, renewed.binding.resource + "changed")).toBe(false);
        renewRegisteredRecovery(f.state, f.control, f.identities, f.operator, f.session, signed, renewed);
        expect(f.state.remediationRun(replacement.runId)?.closedPullRequestReplacement?.approvalId).toBe(signed.approvalId);
    });

    it("rejects excessive duration, a different operator, and a revoked build grant", async () => {
        const f = fixture();
        const prepared = await f.prepare();
        const initial = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, prepared.resource);
        registerClosedPullRequestRecovery(f.state, f.control, f.identities, f.operator, f.session, initial, prepared, f.directory);
        const renewed = await prepareRegisteredRecoveryRenewal(f.state, { run: f.run }, f.before.runId);
        const excessive = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, renewed.binding.resource, 43201);
        expect(() => renewRegisteredRecovery(f.state, f.control, f.identities, f.operator, f.session, excessive, renewed)).toThrow(/duration/);
        const other = f.identities.enroll("synthetic", "Other operator");
        const operator = f.identities.authenticate(other.operator.operatorId, other.credential);
        const signedOther = f.identities.approve(operator, CLOSED_PR_RECOVERY_ACTION, renewed.binding.resource);
        expect(() => renewRegisteredRecovery(f.state, f.control, f.identities, operator, f.session, signedOther, renewed)).toThrow();
        const signed = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, renewed.binding.resource);
        f.control.revokeSession(f.session.sessionId, "fixture revocation");
        expect(() => renewRegisteredRecovery(f.state, f.control, f.identities, f.operator, f.session, signed, renewed)).toThrow(/grant/);
    });

    it("reuses an unexpired exact-scope approval after an interruption while independently checking the grant", async () => {
        const f = fixture();
        const prepared = await f.prepare();
        const approval = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, prepared.resource, 43200);
        registerClosedPullRequestRecovery(f.state, f.control, f.identities, f.operator, f.session, approval, prepared, f.directory);
        const resumed = await prepareRegisteredRecoveryRenewal(f.state, { run: f.run }, f.before.runId);
        for (let attempt = 0; attempt < 2; attempt++) {
            expect(() => verifyClosedPullRequestRecoveryApproval(f.identities, f.operator, f.session,
                approval, resumed.binding.resource)).not.toThrow();
            expect(f.control.authorizeAction(f.session.sessionId, "PROPOSE_CHANGE", "MEDIUM", branch, approval.approvalId).allowed).toBe(true);
        }
        expect(() => verifyClosedPullRequestRecoveryApproval(f.identities, f.operator, f.session,
            approval, resumed.binding.resource + "changed")).toThrow();
        f.control.revokeSession(f.session.sessionId, "fixture revocation");
        expect(f.control.authorizeAction(f.session.sessionId, "PROPOSE_CHANGE", "MEDIUM", branch, approval.approvalId).allowed).toBe(false);
        expect(f.state.productionRun(f.before.runId)?.repairAttempts).toBe(1);
    });

    it("rebinds a fresh approved grant without issuing another recovery signature", async () => {
        const f = fixture();
        const prepared = await f.prepare();
        const approval = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, prepared.resource, 43200);
        const replacement = registerClosedPullRequestRecovery(f.state, f.control, f.identities, f.operator, f.session, approval, prepared, f.directory);
        const before = f.state.productionRun(f.before.runId);
        const issuance = f.identities.approve(f.operator, "ISSUE_BUILD_GRANT", system.systemId);
        const freshSession = f.control.activateSystem(system.systemId, "HUMAN_GATED", f.operator.operatorId, issuance.approvalId);
        const refreshed = await prepareRegisteredRecoveryRenewal(f.state, { run: f.run }, f.before.runId);
        rebindRegisteredRecoveryGrant(f.state, f.control, f.identities, f.operator, freshSession, refreshed);
        const binding = f.state.remediationRun(replacement.runId)!.closedPullRequestReplacement!;
        expect(binding).toMatchObject({ approvalId: approval.approvalId, sessionId: freshSession.sessionId, resource: prepared.resource });
        expect(f.state.audit().filter(item => item.eventId === approval.approvalId)).toHaveLength(1);
        expect(f.state.audit().filter(item => item.type === "RECOVERY_GRANT_REBOUND")).toHaveLength(1);
        expect(f.state.productionRun(f.before.runId)).toEqual(before);
        expect(() => verifyClosedPullRequestRecoveryApproval(f.identities, f.operator, freshSession, approval, binding.resource, new Date(), true)).not.toThrow();
        expect(() => rebindRegisteredRecoveryGrant(f.state, f.control, f.identities, f.operator, freshSession, refreshed)).toThrow(/changed before approval renewal/);
    });

    it("refuses to rebind an expired signature or a revoked fresh grant", async () => {
        const f = fixture();
        const prepared = await f.prepare();
        const approval = f.identities.approve(f.operator, CLOSED_PR_RECOVERY_ACTION, prepared.resource);
        registerClosedPullRequestRecovery(f.state, f.control, f.identities, f.operator, f.session, approval, prepared, f.directory);
        const issuance = f.identities.approve(f.operator, "ISSUE_BUILD_GRANT", system.systemId);
        const freshSession = f.control.activateSystem(system.systemId, "HUMAN_GATED", f.operator.operatorId, issuance.approvalId);
        const refreshed = await prepareRegisteredRecoveryRenewal(f.state, { run: f.run }, f.before.runId);
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date(approval.expiresAt));
            expect(() => rebindRegisteredRecoveryGrant(f.state, f.control, f.identities, f.operator, freshSession, refreshed)).toThrow(/operator-signed/);
        } finally { vi.useRealTimers(); }
        f.control.revokeSession(freshSession.sessionId, "fixture revocation");
        expect(() => rebindRegisteredRecoveryGrant(f.state, f.control, f.identities, f.operator, freshSession, refreshed)).toThrow(/grant/);
    });

    it("rejects original Genesis and an alias to its inode", () => {
        const original = mkdtempSync(join(tmpdir(), "pbos-original-"));
        const candidate = mkdtempSync(join(tmpdir(), "pbos-copy-"));
        writeFileSync(join(original, "genesis-state.json"), "{}");
        linkSync(join(original, "genesis-state.json"), join(candidate, "genesis-state.json"));
        expect(() => assertIsolatedRecoveryState(original, original)).toThrow(/isolated/);
        expect(() => assertIsolatedRecoveryState(candidate, original)).toThrow(/isolated/);
    });
});
