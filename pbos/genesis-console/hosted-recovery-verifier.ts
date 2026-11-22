import { createHash } from "crypto";
import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { AuthenticatedOperator, GenesisStateRepository, OperatorIdentityService, VerifiableApproval } from "../genesis-state";
import { CommandRunner } from "../platform";
import { ProductionRuntimeService } from "../production-runtime";
import { GenesisBuildSession, GenesisControlPlane } from "./genesis-control-plane";
import { verifyClosedPullRequestRecoveryApproval } from "./closed-pull-request-recovery";

/** Locally retained dispatch identity; never contains an operator credential or signing key. */
export interface HostedRecoveryCheckpoint {
    readonly runId: string;
    readonly githubRunId: number;
    readonly coreSha: string;
    readonly platformSha: string;
    readonly baseSha: string;
    readonly pullRequest: number;
    readonly workflowPath: string;
    readonly actorId: number;
    readonly nonce: string;
}

interface HostedRun {
    id?: number; event?: string; status?: string; conclusion?: string; head_sha?: string; run_attempt?: number;
    path?: string; actor?: { id?: number }; repository?: { id?: number; full_name?: string }; created_at?: string;
}
interface HostedArtifact {
    name?: string; expired?: boolean; digest?: string; workflow_run?: { id?: number; head_sha?: string };
}
interface HostedReceipt {
    schemaVersion?: number; runId?: string; nonce?: string; platformSha?: string; pullRequest?: number;
    githubRunId?: number; checks?: readonly { dimension?: string; passed?: boolean; detail?: string }[];
}

/** Validate GitHub API metadata, the downloaded archive digest and its exact-scope receipt.
 * This function does not mutate Genesis or confer acceptance authority. */
export async function verifyHostedRecoveryEvidence(input: {
    readonly state: GenesisStateRepository; readonly identities: OperatorIdentityService;
    readonly operator: AuthenticatedOperator; readonly session: GenesisBuildSession; readonly control: GenesisControlPlane;
    readonly approval: VerifiableApproval; readonly resource: string; readonly checkpoint: HostedRecoveryCheckpoint;
    readonly commands: CommandRunner; readonly archive: Buffer;
}): Promise<void> {
    const { state, identities, operator, session, control, approval, resource, checkpoint, commands } = input;
    const scope = JSON.parse(resource) as Record<string, unknown>;
    if (!/^[a-f0-9]{40}$/.test(checkpoint.coreSha) || !/^[a-f0-9]{40}$/.test(checkpoint.platformSha) ||
        !/^[a-f0-9]{40}$/.test(checkpoint.baseSha) || !/^[a-f0-9]{64}$/.test(checkpoint.nonce) ||
        !Number.isSafeInteger(checkpoint.githubRunId) || checkpoint.githubRunId <= 0 ||
        !Number.isSafeInteger(checkpoint.actorId) || checkpoint.actorId <= 0 ||
        checkpoint.workflowPath !== ".github/workflows/pbos-core-readonly-preflight.yml" ||
        scope.runId !== checkpoint.runId || scope.missionId !== "048-phase-01-item-hostinger-email" || scope.commit !== checkpoint.platformSha ||
        scope.baseCommit !== checkpoint.baseSha || scope.replacementPullRequest !== checkpoint.pullRequest ||
        scope.repository !== "sgwalton87/playbook-platform") throw new Error("Hosted recovery checkpoint scope is invalid.");
    const run = state.productionRun(checkpoint.runId);
    const remediationId = run?.evidenceIds.filter(id => id.startsWith("remediation-run:")).at(-1)?.slice("remediation-run:".length);
    const replacement = remediationId ? state.remediationRun(remediationId)?.closedPullRequestReplacement : undefined;
    const rebound = state.audit().some(item => item.type === "RECOVERY_GRANT_REBOUND" && item.actorId === operator.operatorId &&
        item.resource === resource && item.evidence.sessionId === session.sessionId && item.evidence.approvalId === approval.approvalId);
    if (!run || run.actorId !== operator.operatorId || run.currentCommit !== checkpoint.platformSha ||
        run.repository !== scope.repository || run.currentBranch !== scope.branch || !new ProductionRuntimeService(state).verifyIntegrity().valid ||
        replacement?.resource !== resource || replacement.approvalId !== approval.approvalId ||
        replacement.sessionId !== session.sessionId || session.system.repository !== scope.repository ||
        !state.audit().some(item => item.eventId === approval.approvalId && item.resource === resource)) {
        throw new Error("Hosted recovery no longer matches the registered authorization.");
    }
    verifyClosedPullRequestRecoveryApproval(identities, operator, session, approval, resource, new Date(), rebound);
    if (!control.authorizeAction(session.sessionId, "PROPOSE_CHANGE", "MEDIUM", run.currentBranch, approval.approvalId).allowed) {
        throw new Error("Hosted recovery build grant is unavailable.");
    }
    const repo = "sgwalton87/PBOS-CORE";
    const metadata = JSON.parse((await commands.run("gh", ["api", `repos/${repo}/actions/runs/${checkpoint.githubRunId}`])).stdout) as HostedRun;
    if (metadata.id !== checkpoint.githubRunId || metadata.event !== "workflow_dispatch" || metadata.status !== "completed" ||
        metadata.conclusion !== "success" || metadata.head_sha !== checkpoint.coreSha || metadata.run_attempt !== 1 ||
        metadata.path !== checkpoint.workflowPath || metadata.actor?.id !== checkpoint.actorId ||
        metadata.repository?.id !== 1321290119 || metadata.repository.full_name !== repo ||
        !metadata.created_at || !Number.isFinite(Date.parse(metadata.created_at)) ||
        Date.parse(metadata.created_at) < Date.parse(approval.issuedAt)) {
        throw new Error("Hosted recovery GitHub run identity is invalid.");
    }
    const corePr = JSON.parse((await commands.run("gh", ["api", `repos/${repo}/pulls/113`])).stdout) as {
        state?: string; merged?: boolean; base?: { ref?: string }; head?: { sha?: string; repo?: { full_name?: string } }
    };
    if (corePr.state !== "open" || corePr.merged !== false || corePr.base?.ref !== "main" ||
        corePr.head?.sha !== checkpoint.coreSha || corePr.head.repo?.full_name !== repo) {
        throw new Error("Hosted recovery Core workflow proposal moved.");
    }
    const pr = JSON.parse((await commands.run("gh", ["api", `repos/sgwalton87/playbook-platform/pulls/${checkpoint.pullRequest}`])).stdout) as {
        state?: string; merged?: boolean; base?: { sha?: string }; head?: { sha?: string; repo?: { full_name?: string } }
    };
    if (pr.state !== "open" || pr.merged !== false || pr.base?.sha !== checkpoint.baseSha || pr.head?.sha !== checkpoint.platformSha ||
        pr.head.repo?.full_name !== "sgwalton87/playbook-platform") throw new Error("Hosted recovery Platform PR moved.");
    const jobs = JSON.parse((await commands.run("gh", ["api", `repos/${repo}/actions/runs/${checkpoint.githubRunId}/jobs?per_page=100`])).stdout) as {
        jobs?: readonly { name?: string; status?: string; conclusion?: string; steps?: readonly { name?: string; conclusion?: string }[] }[]
    };
    const acceptance = (jobs.jobs ?? []).filter(job => job.name === "hostinger-governed-acceptance");
    if (acceptance.length !== 1 || acceptance[0].status !== "completed" || acceptance[0].conclusion !== "success" ||
        !acceptance[0].steps?.some(step => step.name === "Run exact Hostinger acceptance" && step.conclusion === "success")) {
        throw new Error("Hosted recovery acceptance job did not pass.");
    }
    const artifacts = JSON.parse((await commands.run("gh", ["api", `repos/${repo}/actions/runs/${checkpoint.githubRunId}/artifacts`])).stdout) as { artifacts?: HostedArtifact[] };
    const candidates = (artifacts.artifacts ?? []).filter(item => item.name === `hostinger-acceptance-${checkpoint.nonce}`);
    const artifact = candidates[0];
    const hash = `sha256:${createHash("sha256").update(input.archive).digest("hex")}`;
    if (candidates.length !== 1 || artifact.expired !== false || artifact.digest !== hash ||
        artifact.workflow_run?.id !== checkpoint.githubRunId || artifact.workflow_run.head_sha !== checkpoint.coreSha) {
        throw new Error("Hosted recovery artifact identity or digest is invalid.");
    }
    if (input.archive.length > 50 * 1024 * 1024) throw new Error("Hosted recovery artifact is too large.");
    const directory = await mkdtemp(join(tmpdir(), "pbos-hosted-evidence-"));
    let receipt: HostedReceipt | null;
    try {
        const archivePath = join(directory, "evidence.zip");
        await writeFile(archivePath, input.archive, { mode: 0o600 });
        const listing = await promisify(execFile)("unzip", ["-Z1", archivePath], { maxBuffer: 1024 * 1024, timeout: 10_000 });
        const names = listing.stdout.trim().split("\n");
        for (const name of ["receipt.json", "desktop.png", "mobile.png", "trace.zip", "accessibility.json", "playwright-results.json"]) {
            if (names.filter(item => item === name).length !== 1) throw new Error(`Hosted recovery artifact is missing ${name}.`);
            const part = await promisify(execFile)("unzip", ["-p", archivePath, name], { encoding: "buffer", maxBuffer: 20 * 1024 * 1024, timeout: 10_000 });
            if (!part.stdout.length) throw new Error(`Hosted recovery artifact is empty: ${name}.`);
        }
        const extracted = await promisify(execFile)("unzip", ["-p", archivePath, "receipt.json"], { maxBuffer: 1024 * 1024, timeout: 10_000 });
        receipt = JSON.parse(extracted.stdout) as HostedReceipt | null;
    } finally { await rm(directory, { recursive: true, force: true }); }
    const dimensions = ["ROUTE", "AUTHORITY", "DURABLE_DATA", "PBOS_INTEGRATION", "SECURITY"];
    if (!receipt || receipt.schemaVersion !== 1 || receipt.runId !== checkpoint.runId || receipt.nonce !== checkpoint.nonce ||
        receipt.platformSha !== checkpoint.platformSha || receipt.pullRequest !== checkpoint.pullRequest ||
        receipt.githubRunId !== checkpoint.githubRunId || !Array.isArray(receipt.checks) ||
        dimensions.some(dimension => !receipt.checks!.some(item => item.dimension === dimension && item.passed === true &&
            typeof item.detail === "string" && item.detail.trim().length > 0))) {
        throw new Error("Hosted recovery acceptance receipt is incomplete or mismatched.");
    }
}
