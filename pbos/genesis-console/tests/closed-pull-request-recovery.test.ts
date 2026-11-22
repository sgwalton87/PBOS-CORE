import { linkSync, mkdtempSync, realpathSync, writeFileSync } from "fs";
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
    recoveryApprovalDuration, MAX_RECOVERY_APPROVAL_MINUTES, preflightRecoveryBrowser } from "../closed-pull-request-recovery";
import { GenesisControlPlane } from "../genesis-control-plane";
import { GenesisSystemCatalog } from "../system-catalog";
import { REFERENCE_SYSTEMS } from "../system-definition";

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

    it("rejects original Genesis and an alias to its inode", () => {
        const original = mkdtempSync(join(tmpdir(), "pbos-original-"));
        const candidate = mkdtempSync(join(tmpdir(), "pbos-copy-"));
        writeFileSync(join(original, "genesis-state.json"), "{}");
        linkSync(join(original, "genesis-state.json"), join(candidate, "genesis-state.json"));
        expect(() => assertIsolatedRecoveryState(original, original)).toThrow(/isolated/);
        expect(() => assertIsolatedRecoveryState(candidate, original)).toThrow(/isolated/);
    });
});
