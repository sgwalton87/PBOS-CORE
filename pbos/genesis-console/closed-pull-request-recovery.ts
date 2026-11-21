import { randomUUID } from "crypto";
import { existsSync, realpathSync, statSync } from "fs";
import { isAbsolute, join } from "path";
import { AuthenticatedOperator, GenesisStateRepository, OperatorIdentityService, VerifiableApproval } from "../genesis-state";
import { CommandRunner } from "../platform";
import { FunctionalAcceptancePlan, ProductionRuntimeService } from "../production-runtime";
import { GitHubCheckCollector, RemediationRun } from "../validation-automation";
import { GenesisBuildSession, GenesisControlPlane } from "./genesis-control-plane";

export const CLOSED_PR_RECOVERY_ACTION = "RECOVER_CLOSED_PULL_REQUEST";
const HOSTINGER_MISSION = "048-phase-01-item-hostinger-email";
const BROWSER_SPEC = "tests/acceptance/pbos-hostinger-email.spec.ts";
const REQUIRED_ENVIRONMENT = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY", "SMTP_USER", "SMTP_PASS", "MAIL_GATEWAY_SECRET"] as const;

interface PullRequestMetadata {
    state: "open" | "closed";
    merged: boolean;
    base: { ref: string; sha: string };
    head: { ref: string; sha: string; repo: { full_name: string } | null };
}

export function assertIsolatedRecoveryState(stateRoot: string, originalStateRoot: string): void {
    const candidatePath = join(stateRoot, "genesis-state.json");
    const originalPath = join(originalStateRoot, "genesis-state.json");
    const candidate = statSync(candidatePath);
    const original = existsSync(originalPath) ? statSync(originalPath) : undefined;
    if (!isAbsolute(stateRoot) || realpathSync(candidatePath) !== join(realpathSync(stateRoot), "genesis-state.json") ||
        (original && candidate.dev === original.dev && candidate.ino === original.ino)) {
        throw new Error("Closed pull request recovery requires an explicit isolated Genesis state directory.");
    }
}

export async function prepareClosedPullRequestRecovery(state: GenesisStateRepository, commands: CommandRunner, runId: string,
    replacementNumber: number, baseCommit: string, commit: string, checkout: string) {
    const run = state.productionRun(runId);
    const mission = run && state.missionQueue(run.systemId).find(item => item.title === run.selectedMission);
    const historicalId = run?.evidenceIds.filter(id => id.startsWith("remediation-run:")).at(-1)?.slice("remediation-run:".length);
    const historical = historicalId && state.remediationRun(historicalId);
    const production = new ProductionRuntimeService(state);
    if (!run || run.status !== "BLOCKED" || run.activeRecoveryEpochId || production.repairBudget(runId).remaining < 1 ||
        run.repository !== "sgwalton87/playbook-platform" || mission?.missionId !== HOSTINGER_MISSION ||
        mission.completionPolicy?.kind !== "FUNCTIONAL_APPLICATION" ||
        !run.functionalAcceptancePlan || !historical || historical.closedPullRequestReplacement ||
        historical.systemId !== run.systemId || historical.pullRequest.repository !== run.repository ||
        historical.pullRequest.branch !== run.currentBranch || !Number.isSafeInteger(replacementNumber) ||
        replacementNumber <= 0 || historical.pullRequest.number === replacementNumber ||
        ![baseCommit, commit].every(sha => /^[a-f0-9]{40}$/.test(sha)) || baseCommit === commit ||
        !production.verifyIntegrity().valid || production.activeRun(run.repository)) {
        throw new Error("Closed pull request recovery requires an intact, blocked, bounded Hostinger mission and exact replacement lineage.");
    }
    const readPullRequest = async (number: number): Promise<PullRequestMetadata> =>
        JSON.parse((await commands.run("gh", ["api", `repos/${run.repository}/pulls/${number}`])).stdout);
    const prior = await readPullRequest(historical.pullRequest.number);
    const proposed = await readPullRequest(replacementNumber);
    if (prior.state !== "closed" || prior.merged || prior.head.sha !== historical.headSha ||
        prior.head.ref !== historical.pullRequest.branch || prior.head.repo?.full_name !== run.repository ||
        proposed.state !== "open" || proposed.merged || proposed.base.ref !== run.startingBranch || proposed.base.sha !== baseCommit ||
        proposed.head.repo?.full_name !== run.repository || proposed.head.sha !== commit ||
        proposed.head.ref === run.currentBranch || !/^agent\/[a-z0-9-]+$/.test(proposed.head.ref)) {
        throw new Error("Closed and replacement pull request identities did not match the requested lineage.");
    }
    const pullRequest = { number: replacementNumber, branch: proposed.head.ref, repository: run.repository,
        url: `https://github.com/${run.repository}/pull/${replacementNumber}` };
    const checks = await new GitHubCheckCollector(commands).collect(pullRequest);
    if (checks.pullRequestState !== "OPEN" || checks.headSha !== commit || checks.baseRefName !== proposed.base.ref ||
        !checks.evidence.some(item => item.state === "PASSED") ||
        !checks.evidence.every(item => ["PASSED", "SKIPPED"].includes(item.state))) {
        throw new Error("Replacement requires independent GitHub Actions checks on its exact open head.");
    }
    const directory = await verifyClosedPullRequestRecoveryCheckout(commands, checkout, pullRequest.branch, commit, baseCommit);
    const resource = JSON.stringify({ runId, missionId: mission.missionId, repository: run.repository,
        oldPullRequest: historical.pullRequest.number, oldHead: prior.head.sha, oldRunCommit: run.currentCommit,
        replacementPullRequest: pullRequest.number, branch: pullRequest.branch, baseCommit, commit });
    return { run, historical, pullRequest, checks, directory, resource, baseCommit, commit };
}

export async function verifyClosedPullRequestRecoveryCheckout(commands: CommandRunner, checkout: string, branch: string,
    commit: string, baseCommit: string): Promise<string> {
    const directory = realpathSync(checkout);
    const git = async (...args: string[]) => (await commands.run("git", args, directory)).stdout.trim();
    if (await git("rev-parse", "--show-toplevel") !== directory || await git("rev-parse", "HEAD") !== commit ||
        await git("branch", "--show-current") !== branch ||
        await git("merge-base", commit, baseCommit) !== baseCommit || await git("status", "--porcelain") ||
        [".env", ".env.local", ".env.development", ".env.development.local"].some(name => existsSync(join(directory, name)))) {
        throw new Error("Replacement requires a clean exact-revision checkout with no checkout-local environment.");
    }
    await git("cat-file", "-e", `${commit}:${BROWSER_SPEC}`);
    return directory;
}

type PreparedRecovery = Awaited<ReturnType<typeof prepareClosedPullRequestRecovery>>;

export function verifyClosedPullRequestRecoveryApproval(identities: OperatorIdentityService, operator: AuthenticatedOperator,
    session: GenesisBuildSession, approval: VerifiableApproval, resource: string, now = new Date()): void {
    if (session.grant.issuedBy !== operator.operatorId || session.grant.mode !== "HUMAN_GATED" ||
        approval.operatorId !== operator.operatorId || approval.organizationId !== operator.organizationId ||
        !(session.grant.issuedAt.getTime() <= Date.parse(approval.issuedAt)) ||
        !(Date.parse(approval.issuedAt) <= now.getTime()) || !(Date.parse(approval.expiresAt) > now.getTime()) ||
        !identities.verify(approval, CLOSED_PR_RECOVERY_ACTION, resource, now)) {
        throw new Error("A current operator-signed, exact-lineage recovery approval and human-gated build grant are required.");
    }
}

export function registerClosedPullRequestRecovery(state: GenesisStateRepository, control: GenesisControlPlane,
    identities: OperatorIdentityService, operator: AuthenticatedOperator, session: GenesisBuildSession,
    approval: VerifiableApproval, prepared: PreparedRecovery, stateRoot: string): RemediationRun {
    const { run, historical, pullRequest, checks, commit, baseCommit, directory, resource } = prepared;
    verifyClosedPullRequestRecoveryApproval(identities, operator, session, approval, resource);
    if (run.actorId !== operator.operatorId || session.system.systemId !== run.systemId ||
        session.system.repository !== run.repository ||
        !control.authorizeAction(session.sessionId, "PROPOSE_CHANGE", "MEDIUM", pullRequest.branch, approval.approvalId).allowed) {
        throw new Error("The recovery operator and build grant must own the governed run and replacement branch.");
    }
    const now = new Date().toISOString();
    const replacement: RemediationRun = { runId: randomUUID(), systemId: run.systemId, pullRequest, headSha: commit,
        closedPullRequestReplacement: { headSha: commit, approvalId: approval.approvalId, resource,
            sessionId: session.sessionId, historicalRemediationId: historical.runId, baseCommit },
        pullRequestState: "OPEN", attempt: historical.attempt, maximumAttempts: historical.maximumAttempts,
        state: "READY_FOR_CERTIFICATION", evidence: checks.evidence, blockers: [], updatedAt: now };
    const current = run.functionalAcceptancePlan!;
    const publicEnvironment = { PBOS_ENABLE_HOSTINGER_RECOVERY: "YES", PBOS_ALLOW_SYNTHETIC_AUTH_WRITE: "YES",
        SMTP_HOST: "127.0.0.1", SMTP_PORT: "54325", SMTP_SECURE: "false",
        PLAYWRIGHT_BASE_URL: "http://127.0.0.1:4319", PBOS_ACCEPTANCE_COMMIT: commit };
    const plan: FunctionalAcceptancePlan = { ...current, planId: `${HOSTINGER_MISSION}:${commit}`, commit,
        branch: pullRequest.branch, workingDirectory: directory, localSyntheticHostingerRecovery: true,
        protectedEnvironmentFiles: [{ path: join(realpathSync(stateRoot), "secrets", "hostinger-recovery.env") }],
        launch: { ...current.launch, healthPath: "/login", baseUrl: publicEnvironment.PLAYWRIGHT_BASE_URL,
            requiredEnvironmentVariables: REQUIRED_ENVIRONMENT, publicEnvironment },
        probes: current.probes.filter(probe => probe.path === "/check-email" && (probe.method ?? "GET") === "GET"),
        browserJourneys: current.browserJourneys.map(journey => ({ ...journey, route: "/check-email",
            command: { command: "npx", args: ["playwright", "test", BROWSER_SPEC, "--project=chromium"],
                requiredEnvironmentVariables: REQUIRED_ENVIRONMENT, publicEnvironment } })),
        previewDeployment: undefined, durablePreview: undefined };
    const updated = { ...run, currentBranch: pullRequest.branch, currentCommit: commit,
        repositoryContextId: `repository:${run.repository}:${commit}`, acceptanceEvidence: [], previewArtifactIds: [],
        evidenceIds: [...run.evidenceIds, `remediation-run:${replacement.runId}`], lastHeartbeatAt: now,
        functionalAcceptancePlan: plan };
    state.recordClosedPullRequestReplacement(run, historical, updated, replacement, session.grant.grantId,
        { eventId: approval.approvalId, type: "VERIFIABLE_APPROVAL", actorId: operator.operatorId, resource,
            occurredAt: now, evidence: { approval } },
        { eventId: randomUUID(), timestamp: now, runId: run.runId, actorId: operator.operatorId,
            severity: "INFO", type: "CLOSED_PULL_REQUEST_REPLACED", status: "BLOCKED",
            summary: "Closed pull request retained and exact approved replacement attached for validation.",
            repository: run.repository, branch: pullRequest.branch, commit, correlationId: run.runId, parentEntityId: run.runId,
            payload: { historicalRemediationId: historical.runId, replacementRemediationId: replacement.runId,
                historicalPullRequest: historical.pullRequest.number, replacementPullRequest: pullRequest.number,
                approvalId: approval.approvalId, baseCommit, commit } });
    return replacement;
}
